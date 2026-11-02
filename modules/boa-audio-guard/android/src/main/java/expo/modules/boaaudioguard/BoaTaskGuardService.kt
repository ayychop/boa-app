package expo.modules.boaaudioguard

import android.app.ActivityManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Process

/**
 * Up while BOA Radio (or a Zen soundscape) is on. When the app is swiped away
 * from Recents, Android calls onTaskRemoved (the manifest says
 * stopWithTask="false"), and the sound would otherwise carry on: it plays
 * from a foreground service, which outlives the screen.
 *
 * So the radio stops, with one exception: in a car (Android Auto, car mode, or
 * Bluetooth to a head unit; see CarLink) it plays on, and stops when the car
 * is left. Stopping is JS first (a pause, if it is still there to hear it),
 * then the process ends, so no player, notification or foreground service
 * outlasts the app. The process is left alone only while one of BOA's own
 * foreground services, a ringing alarm or a call, is running: swiping away
 * must never cut those off.
 */
class BoaTaskGuardService : Service() {
  private var carWatch: CarLink.Watch? = null
  private var leaving = false

  override fun onBind(intent: Intent?): IBinder? = null

  // Not restarted if Android ends it: with the process gone there's no sound to stop.
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY

  override fun onTaskRemoved(rootIntent: Intent?) {
    super.onTaskRemoved(rootIntent)
    val c = applicationContext
    if (CarLink.connected(c)) {
      // In a car: carry on, and stop the moment it is left.
      carWatch?.stop()
      carWatch = CarLink.Watch(c) { if (!CarLink.connected(c)) shutDown() }.start()
      return
    }
    shutDown()
  }

  private fun shutDown() {
    if (leaving) return
    leaving = true
    carWatch?.stop()
    carWatch = null
    BoaAudioGuardModule.live?.taskRemoved()
    val c = applicationContext
    // A moment for JS to pause itself cleanly, then make sure.
    Handler(Looper.getMainLooper()).postDelayed({
      val spare = !othersRunning(c)
      stopSelf()
      if (spare) Process.killProcess(Process.myPid())
    }, KILL_DELAY_MS)
  }

  override fun onDestroy() {
    carWatch?.stop()
    carWatch = null
    super.onDestroy()
  }

  /** Whether a BOA alarm or call service is running in this app (Android shows an app only its own). */
  @Suppress("DEPRECATION")
  private fun othersRunning(c: Context): Boolean =
    try {
      val am = c.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val me = Process.myPid()
      am.getRunningServices(Int.MAX_VALUE).any { s -> s.pid == me && KEEP.any { s.service.className.startsWith(it) } }
    } catch (_: Exception) {
      false
    }

  companion object {
    private const val KILL_DELAY_MS = 450L
    // A ringing alarm, a call (ringing or on), and the car video screen.
    private val KEEP = listOf("expo.modules.boaalarm.", "expo.modules.boacall.", "expo.modules.boacarvideo.")
  }
}
