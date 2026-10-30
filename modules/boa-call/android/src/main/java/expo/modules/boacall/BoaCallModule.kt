package expo.modules.boacall

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlin.math.max

/** What JS hands over to ring a call (src/calls/incoming.js builds it). */
class IncomingCall : Record {
  @Field val callId: String = ""
  @Field val name: String = ""
  // Their photo (https), shown on the call screen; empty for the BOA logo.
  @Field val avatar: String = ""
  // network.boa://call/... links: opening the call, and answering it.
  @Field val link: String = ""
  @Field val acceptLink: String = ""
  // The ringtone's channel (boa-call-<ringtone>, src/chat/notifications.js).
  @Field val channelId: String = ""
  @Field val timeoutMs: Double = 45000.0
  // The buzz: [wait, buzz, wait, ...] ms on the ringtone's bass hits (src/calls/ringtoneHaptics.js).
  @Field val vibration: List<Double> = emptyList()
  // Your own song (a file:// BOA keeps), which rings instead of the channel's sound.
  @Field val soundUri: String = ""

  fun info() = CallInfo(callId, name, avatar, link, acceptLink, channelId, timeoutMs.toLong(), vibration.map { it.toLong() }.toLongArray(), soundUri)
}

/** A ring with the app on screen: the same Ringer as a call rung by notification, without the notification. */
class Ring : Record {
  @Field val channelId: String = ""
  @Field val soundUri: String = ""
  @Field val timeoutMs: Double = 60000.0
  @Field val vibration: List<Double> = emptyList()
}

/**
 * An incoming BOA video call, rung like a phone call. IncomingCallService
 * (a phoneCall foreground service) rings: the ringtone on a loop and the
 * buzz (Ringer), and the call-style notification, whose full-screen intent
 * opens IncomingCallActivity over the lock screen. A locked or sleeping
 * phone wakes straight to it; an unlocked one in use gets the heads-up.
 *
 * Answering opens the app on a network.boa://call link, which CallContext
 * turns into the call. Decline (or swiping it away) stops the ring at once
 * and reaches JS if it's running; otherwise the caller hears "No answer".
 */
class BoaCallModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "No React context" }

  private val manager: NotificationManagerCompat
    get() = NotificationManagerCompat.from(context)

  // The power button: the screen going off and on, for a call's camera (src/calls/media.native.js: setAway).
  private var screen: BroadcastReceiver? = null
  // The phone heating up: step the call camera down (src/calls/thermal.js).
  private var thermal: PowerManager.OnThermalStatusChangedListener? = null
  // The battery's temperature and charger, which heat up before PowerManager says so.
  private var battery: BroadcastReceiver? = null
  private var lastHeat = ""

  override fun definition() = ModuleDefinition {
    Name("BoaCall")

    Events("onDecline", "onPipChange", "onHangUp", "onScreenChange", "onThermalChange", "onPipAction")

    OnCreate {
      CallDeclineReceiver.onDecline = { id -> sendEvent("onDecline", mapOf("callId" to id)) }
      CallDeclineReceiver.onHangUp = { sendEvent("onHangUp", emptyMap<String, Any>()) }
      CallPip.onChange = { active -> sendEvent("onPipChange", mapOf("active" to active)) }
      // Mute / Chat / End tapped on the floating call window (CallPipReceiver).
      CallPipReceiver.onAction = { action -> sendEvent("onPipAction", mapOf("action" to action)) }
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, intent: Intent) {
          sendEvent("onScreenChange", mapOf("on" to (intent.action == Intent.ACTION_SCREEN_ON)))
        }
      }
      val filter = IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_OFF)
        addAction(Intent.ACTION_SCREEN_ON)
      }
      // System broadcasts still arrive not exported; nothing from other apps does.
      appContext.reactContext?.let { c -> runCatching { ContextCompat.registerReceiver(c, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED) } }
      screen = receiver
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val pm = appContext.reactContext?.getSystemService(Context.POWER_SERVICE) as? PowerManager
        if (pm != null) {
          val listener = PowerManager.OnThermalStatusChangedListener { _ -> emitHeat() }
          runCatching { pm.addThermalStatusListener(listener) }
          thermal = listener
        }
      }
      // PowerManager's status can lag a hot, charging phone. The battery
      // broadcast (temperature, plugged in) re-checks, and only a change is sent.
      val heat = object : BroadcastReceiver() {
        override fun onReceive(c: Context, intent: Intent) = emitHeat()
      }
      appContext.reactContext?.let { c ->
        runCatching { ContextCompat.registerReceiver(c, heat, IntentFilter(Intent.ACTION_BATTERY_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED) }
      }
      battery = heat
    }

    OnDestroy {
      CallDeclineReceiver.onDecline = null
      CallDeclineReceiver.onHangUp = null
      CallPip.onChange = null
      CallPipReceiver.onAction = null
      screen?.let { r -> runCatching { appContext.reactContext?.unregisterReceiver(r) } }
      screen = null
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        thermal?.let { listener ->
          val pm = appContext.reactContext?.getSystemService(Context.POWER_SERVICE) as? PowerManager
          runCatching { pm?.removeThermalStatusListener(listener) }
        }
      }
      thermal = null
      battery?.let { r -> runCatching { appContext.reactContext?.unregisterReceiver(r) } }
      battery = null
    }

    /** A call is on (placed, or answered): hold it in the foreground so the screen can go off. */
    AsyncFunction("startOngoing") { name: String, callId: String ->
      OngoingCallService.start(context, name, callId)
    }

    /** The call is over. */
    AsyncFunction("stopOngoing") {
      OngoingCallService.stop(context)
    }

    /** A call is on (true) or over (false): leaving the app now floats it picture in picture. */
    AsyncFunction("setPipReady") { ready: Boolean ->
      CallPip.setReady(ready)
    }.runOnQueue(Queues.MAIN)

    /** Floats the call in its picture-in-picture window now. False if it can't. */
    AsyncFunction("enterPip") {
      CallPip.enter(appContext.currentActivity)
    }.runOnQueue(Queues.MAIN)

    /** Whether this phone does picture in picture. */
    Function("isPipSupported") {
      CallPip.supported(appContext.currentActivity)
    }

    /** The call's mute state, so the floating window's Mute button matches it. */
    AsyncFunction("setPipMuted") { muted: Boolean ->
      CallPip.setMuted(muted)
    }.runOnQueue(Queues.MAIN)

    /** Rings. False if it couldn't (notifications off), so JS can say so. */
    AsyncFunction("showIncoming") { call: IncomingCall ->
      if (!manager.areNotificationsEnabled()) return@AsyncFunction false
      val info = call.info()
      if (IncomingCallService.ring(context, info)) return@AsyncFunction true
      // Android wouldn't start the service: the notification and the ring without it.
      val notification = CallNotification.build(context, info) ?: return@AsyncFunction false
      try {
        manager.notify(CallNotification.ID, notification)
        Ringer.start(context, info.channelId, info.soundUri, info.timeoutMs, info.vibration)
        ScreenWaker.wake(context, 10_000L)
        true
      } catch (e: SecurityException) {
        false
      }
    }

    /**
     * Rings with the app on screen, as the phone does: on the ring volume,
     * following Silent and Vibrate. The sound: soundUri, else channelId's,
     * else the phone's own ringtone.
     */
    AsyncFunction("startRinger") { ring: Ring ->
      Ringer.start(context, ring.channelId, ring.soundUri, ring.timeoutMs.toLong(), ring.vibration.map { it.toLong() }.toLongArray())
    }.runOnQueue(Queues.MAIN)

    /** Stops that ring (and any other: there's only ever one). */
    AsyncFunction("stopRinger") {
      Ringer.stop()
    }.runOnQueue(Queues.MAIN)

    /**
     * A call needs you and the screen is off (they answered your call while
     * the phone was locked): the screen comes on and the call shows over the
     * lock screen, until the call is over (leaveLockScreen).
     */
    AsyncFunction("wakeForCall") {
      ScreenWaker.wake(context, 10_000L)
      CallLockScreen.show()
    }.runOnQueue(Queues.MAIN)

    /** Stops ringing: the call was answered, declined, ended or missed. */
    AsyncFunction("cancelIncoming") {
      IncomingCallService.stop(context)
    }

    /**
     * Whether a call can take over the screen. Android 14+ lets people turn
     * it off for the app (Settings > Apps > Special app access).
     */
    Function("canUseFullScreen") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return@Function true
      (context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager)?.canUseFullScreenIntent() == true
    }

    /** Opens the system setting that allows it. */
    AsyncFunction("openFullScreenSettings") {
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
      } else {
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      }
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }.runOnQueue(Queues.MAIN)

    /** Stops showing over the lock screen once the call is over. */
    AsyncFunction("leaveLockScreen") {
      CallLockScreen.leave()
    }.runOnQueue(Queues.MAIN)

    /** NOMINAL, FAIR, WARNING or CRITICAL: each step down the call camera (720p30, 540p24, 360p15). */
    Function("thermalState") {
      Heat.read(context)
    }
  }

  private fun emitHeat() {
    val c = appContext.reactContext ?: return
    val now = Heat.read(c)
    if (now == lastHeat) return
    lastHeat = now
    sendEvent("onThermalChange", mapOf("status" to now))
  }
}

/**
 * How hot the phone is for a video call: the stricter of Android's thermal
 * status and the battery's temperature, and a step stricter again while it
 * charges (charging heats the phone from the inside: a Flip 7's Exynos on a
 * charger is the worst case).
 *
 * Android's own steps are shifted one down from the old mapping, so the call
 * backs off sooner: LIGHT is FAIR, MODERATE is WARNING, SEVERE and up is
 * CRITICAL. The battery adds its own: FAIR from 38 C, WARNING from 41 C and
 * CRITICAL from 44 C (counted 2 C higher while charging). Cooling off holds
 * the hotter step until the battery is 1 C under its threshold, so the
 * picture doesn't flap between sizes.
 */
private object Heat {
  private val NAMES = arrayOf("NOMINAL", "FAIR", "WARNING", "CRITICAL")
  private val FROM = doubleArrayOf(0.0, 38.0, 41.0, 44.0)
  private const val CHARGING_BIAS = 2.0
  private const val HOLD = 1.0
  private var held = 0

  @Synchronized
  fun read(c: Context): String {
    var level = 0
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val pm = c.getSystemService(Context.POWER_SERVICE) as? PowerManager
      if (pm != null) {
        level = when (pm.currentThermalStatus) {
          PowerManager.THERMAL_STATUS_NONE -> 0
          PowerManager.THERMAL_STATUS_LIGHT -> 1
          PowerManager.THERMAL_STATUS_MODERATE -> 2
          else -> 3
        }
      }
    }
    // The battery's sticky broadcast: no receiver needed to read it.
    val b = runCatching { c.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) }.getOrNull()
    val charging = (b?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0) != 0
    if (b != null) {
      val tenths = b.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE)
      if (tenths != Int.MIN_VALUE && tenths > 0) {
        val t = tenths / 10.0 + if (charging) CHARGING_BIAS else 0.0
        var fromBattery = 0
        for (i in 1..3) if (t >= FROM[i]) fromBattery = i
        // Cooling: keep the hotter step until a degree under its threshold.
        if (fromBattery < held && t > FROM[held] - HOLD) fromBattery = held
        level = max(level, fromBattery)
        held = fromBattery
      } else held = 0
    }
    // Hot and charging at once: one step stricter still.
    if (charging && level in 1..2) level += 1
    return NAMES[level.coerceIn(0, 3)]
  }
}

