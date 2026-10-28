package expo.modules.boacall

import android.content.Context
import android.os.PowerManager

/**
 * Lights a sleeping screen for a call, the way the phone app does when it
 * rings: a short wake lock that turns the screen on (and leaves it on a
 * moment after). The call screen's own flags (turnScreenOn, showWhenLocked,
 * keep screen on) then hold it. Android 14+ asks for TURN_SCREEN_ON for
 * this; without it the wake lock is still taken, just without lighting the
 * screen, so it can never crash.
 */
object ScreenWaker {
  private var lock: PowerManager.WakeLock? = null

  fun wake(context: Context, ms: Long) {
    val pm = context.applicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
    runCatching {
      lock?.takeIf { it.isHeld }?.release()
      @Suppress("DEPRECATION")
      val flags = PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE
      lock = pm.newWakeLock(flags, "boa:call").apply {
        setReferenceCounted(false)
        acquire(ms)
      }
    }
  }
}
