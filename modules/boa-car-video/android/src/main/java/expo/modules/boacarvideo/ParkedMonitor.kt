package expo.modules.boacarvideo

import android.Manifest
import android.annotation.SuppressLint
import android.car.Car
import android.car.VehicleGear
import android.car.VehiclePropertyIds
import android.car.drivingstate.CarUxRestrictions
import android.car.drivingstate.CarUxRestrictionsManager
import android.car.hardware.CarPropertyValue
import android.car.hardware.property.CarPropertyManager
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * Whether the car is parked, from everything the car will tell us, and
 * fail-safe: a signal we can't read never counts as parked.
 *
 * Parked means all of these:
 *  - The car's driving restrictions don't ask for distraction-optimised
 *    apps (CarUxRestrictionsManager: the car's own word on "driving").
 *  - The parking brake is on, or the gear is Park (an automatic in Park
 *    with the brake off is still parked). REQUIRE_PARKING_BRAKE makes the
 *    brake alone decide.
 *  - The car's speed, if we may read it (CAR_SPEED), is under STILL_MS.
 *  - GPS, if we may read it (fine location), hasn't seen the car moving.
 *
 * The first two are required: with neither the restrictions nor the
 * brake/gear readable (not a car, or the car service is down) it is never
 * parked. Speed and GPS can only take "parked" away, never give it.
 *
 * One monitor per process, shared by the player and the JS module; it
 * runs while anyone is listening. Everything happens on the main thread.
 */
object ParkedMonitor {
  private const val TAG = "BoaCarVideo"

  /** True: only the parking brake counts, Park alone isn't enough. */
  const val REQUIRE_PARKING_BRAKE = false

  // Speeds in metres per second. Over MOVING_MS the car is moving; it
  // counts as stopped again only under STILL_MS (so GPS jitter at a
  // standstill can't flicker the picture on and off).
  private const val MOVING_MS = 2.0f // about 7 km/h, 4.5 mph
  private const val STILL_MS = 0.5f

  data class State(
    val parked: Boolean,
    /** Why it isn't parked, for the screen and the logs: driving, brake, speed, gps, unknown. */
    val reason: String?,
  )

  private val main = Handler(Looper.getMainLooper())
  private val listeners = linkedSetOf<(State) -> Unit>()
  private var app: Context? = null

  private var car: Car? = null
  private var ux: CarUxRestrictionsManager? = null
  private var props: CarPropertyManager? = null
  private var location: LocationManager? = null

  // What the car has told us; null is "can't say".
  private var requiresDistractionOptimization: Boolean? = null
  private var brakeOn: Boolean? = null
  private var gear: Int? = null
  private var carMoving: Boolean? = null
  private var gpsMoving: Boolean? = null

  var state = State(parked = false, reason = "unknown")
    private set

  /** Whether this is a car running Android Automotive OS. */
  fun isAutomotive(context: Context): Boolean = context.packageManager.hasSystemFeature(PackageManager.FEATURE_AUTOMOTIVE)

  /** Starts listening (the first listener connects to the car). Returns a stop function. */
  fun listen(context: Context, fn: (State) -> Unit): () -> Unit {
    val first = listeners.isEmpty()
    listeners.add(fn)
    if (first) start(context.applicationContext)
    fn(state)
    return {
      listeners.remove(fn)
      if (listeners.isEmpty()) stop()
    }
  }

  private fun start(context: Context) {
    app = context
    if (!isAutomotive(context)) {
      update()
      return
    }
    try {
      connectCar(context)
    } catch (e: Throwable) {
      // The car service missing or refusing: nothing reads as parked.
      Log.w(TAG, "car service unavailable", e)
    }
    startGps(context)
    update()
  }

  private fun connectCar(context: Context) {
    val c = Car.createCar(context) ?: return
    car = c

    (c.getCarManager(Car.CAR_UX_RESTRICTION_SERVICE) as? CarUxRestrictionsManager)?.let { m ->
      ux = m
      requiresDistractionOptimization = m.currentCarUxRestrictions?.isRequiresDistractionOptimization
      m.registerListener { r: CarUxRestrictions ->
        main.post {
          requiresDistractionOptimization = r.isRequiresDistractionOptimization
          update()
        }
      }
    }

    (c.getCarManager(Car.PROPERTY_SERVICE) as? CarPropertyManager)?.let { p ->
      props = p
      watch(p, VehiclePropertyIds.PARKING_BRAKE_ON, CarPropertyManager.SENSOR_RATE_ONCHANGE) { v ->
        brakeOn = v as? Boolean
      }
      watch(p, VehiclePropertyIds.GEAR_SELECTION, CarPropertyManager.SENSOR_RATE_ONCHANGE) { v ->
        gear = v as? Int
      }
      // Needs CAR_SPEED (asked for at run time); without it, speed stays unknown.
      watch(p, VehiclePropertyIds.PERF_VEHICLE_SPEED, CarPropertyManager.SENSOR_RATE_NORMAL) { v ->
        val speed = (v as? Float)?.let { Math.abs(it) } ?: return@watch
        carMoving = when {
          speed > MOVING_MS -> true
          speed < STILL_MS -> false
          else -> carMoving ?: false
        }
      }
    }
  }

  private val callbacks = mutableListOf<CarPropertyManager.CarPropertyEventCallback>()

  private fun watch(p: CarPropertyManager, id: Int, rate: Float, read: (Any?) -> Unit) {
    val callback = object : CarPropertyManager.CarPropertyEventCallback {
      override fun onChangeEvent(value: CarPropertyValue<*>) {
        main.post {
          if (value.status == CarPropertyValue.STATUS_AVAILABLE) read(value.value)
          update()
        }
      }

      override fun onErrorEvent(propId: Int, zone: Int) {
        Log.w(TAG, "car property $propId unavailable")
      }
    }
    try {
      // Its current value first, then every change.
      runCatching { p.getProperty<Any>(id, 0) }.getOrNull()?.takeIf { it.status == CarPropertyValue.STATUS_AVAILABLE }?.let { read(it.value) }
      if (p.registerCallback(callback, id, rate)) callbacks.add(callback)
    } catch (e: SecurityException) {
      // No permission for this one (CAR_SPEED not granted): left unknown.
      Log.i(TAG, "no permission for car property $id")
    } catch (e: Throwable) {
      Log.w(TAG, "car property $id not readable", e)
    }
  }

  private val gps = LocationListener { fix: Location ->
    if (!fix.hasSpeed()) return@LocationListener
    gpsMoving = when {
      fix.speed > MOVING_MS -> true
      fix.speed < STILL_MS -> false
      else -> gpsMoving ?: false
    }
    update()
  }

  @SuppressLint("MissingPermission")
  private fun startGps(context: Context) {
    if (context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return
    val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return
    if (!lm.allProviders.contains(LocationManager.GPS_PROVIDER)) return
    location = lm
    try {
      lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, gps, Looper.getMainLooper())
    } catch (e: Throwable) {
      Log.w(TAG, "gps unavailable", e)
    }
  }

  private fun stop() {
    runCatching { location?.removeUpdates(gps) }
    runCatching { ux?.unregisterListener() }
    props?.let { p -> callbacks.forEach { runCatching { p.unregisterCallback(it) } } }
    callbacks.clear()
    runCatching { car?.disconnect() }
    car = null
    ux = null
    props = null
    location = null
    requiresDistractionOptimization = null
    brakeOn = null
    gear = null
    carMoving = null
    gpsMoving = null
    state = State(parked = false, reason = "unknown")
  }

  /** The rules above, worked out again from the latest readings, and told to everyone listening if they changed. */
  private fun update() {
    val held = when {
      requiresDistractionOptimization == true -> "driving"
      carMoving == true -> "speed"
      gpsMoving == true -> "gps"
      !brakeOrPark() -> "brake"
      requiresDistractionOptimization == null && brakeOn == null && gear == null -> "unknown"
      else -> null
    }
    val next = State(parked = held == null, reason = held)
    if (next == state) return
    state = next
    Log.i(TAG, "parked=${next.parked} reason=${next.reason}")
    listeners.toList().forEach { it(next) }
  }

  private fun brakeOrPark(): Boolean {
    if (REQUIRE_PARKING_BRAKE) return brakeOn == true
    // Unreadable brake and gear: the driving restrictions decide on their own.
    if (brakeOn == null && gear == null) return requiresDistractionOptimization == false
    return brakeOn == true || gear == VehicleGear.GEAR_PARK
  }
}
