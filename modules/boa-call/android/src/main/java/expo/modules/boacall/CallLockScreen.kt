package expo.modules.boacall

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import expo.modules.core.interfaces.ReactActivityLifecycleListener
import java.lang.ref.WeakReference

/**
 * When the app is opened by a call (the full-screen intent, Answer, or a
 * tap: a network.boa://call link), the activity shows over the lock screen,
 * turns the screen on and keeps it on, so the call is the first thing you
 * see. Set in onCreate and onNewIntent, before the window is drawn, and by
 * show() when a call needs you with the screen off (they answered while
 * the phone was locked). Only for calls: everything else still needs the
 * phone unlocked, and the flags come off when the call is over
 * (BoaCall.leaveLockScreen).
 */
object CallLockScreen : ReactActivityLifecycleListener {
  private var activity = WeakReference<Activity>(null)
  private var on = false
  private var addedKeepOn = false

  private fun isCall(intent: Intent?) = intent?.data?.let { it.scheme == "network.boa" && it.host == "call" } == true

  private fun set(a: Activity, show: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      a.setShowWhenLocked(show)
      a.setTurnScreenOn(show)
    } else {
      @Suppress("DEPRECATION")
      val flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      if (show) a.window.addFlags(flags) else a.window.clearFlags(flags)
    }
    // The screen stays on while the call is up, as on the phone's own call
    // screen. Only taken off if this set it: Zen (expo-keep-awake) uses the
    // same flag, and a call ending mustn't let Zen's screen dim.
    val keepOn = WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
    if (show) {
      if ((a.window.attributes.flags and keepOn) == 0) {
        a.window.addFlags(keepOn)
        addedKeepOn = true
      }
    } else if (addedKeepOn) {
      a.window.clearFlags(keepOn)
      addedKeepOn = false
    }
    on = show
  }

  /** A call needs you now: over the lock screen, screen on (BoaCall.wakeForCall). */
  fun show() {
    activity.get()?.let { set(it, true) }
  }

  override fun onCreate(activity: Activity?, savedInstanceState: Bundle?) {
    activity ?: return
    this.activity = WeakReference(activity)
    if (isCall(activity.intent)) set(activity, true)
  }

  override fun onNewIntent(intent: Intent?): Boolean {
    if (isCall(intent)) activity.get()?.let { set(it, true) }
    return false
  }

  override fun onDestroy(activity: Activity?) {
    if (this.activity.get() === activity) this.activity = WeakReference(null)
  }

  fun leave() {
    if (!on) return
    activity.get()?.let { set(it, false) } ?: run { on = false }
  }
}
