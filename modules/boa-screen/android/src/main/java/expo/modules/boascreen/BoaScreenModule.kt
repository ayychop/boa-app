package expo.modules.boascreen

import android.app.Activity
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.os.Build
import android.view.Choreographer
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The screen turning off (power button, lock, screen timeout) or on, and
 * the phone being unlocked. React Native's AppState can't tell locking the
 * phone from switching to another app (both are just "background"); these
 * system broadcasts can. Only registered while JS is listening.
 *
 * It also lets the Zen screensaver sit over the lock screen: once JS has
 * opened it (while the screen is off), `showOverLock` marks the activity
 * show-when-locked, so pressing the power button again shows Zen straight
 * away instead of the system lock screen. A stage-black cover hides the
 * window until the screensaver's first frames have drawn, then fades.
 * `unlock` asks the system to dismiss the lock (PIN, fingerprint) before
 * anything other than Zen is shown, and only then clears the flag.
 */
class BoaScreenModule : Module() {
  private var receiver: BroadcastReceiver? = null
  private var overLock = false
  private var cover: View? = null

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "No React context" }

  private val hostActivity: Activity?
    get() = appContext.currentActivity

  private val keyguard: KeyguardManager?
    get() = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager

  private fun setShowWhenLocked(activity: Activity, on: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      activity.setShowWhenLocked(on)
    } else {
      @Suppress("DEPRECATION")
      if (on) activity.window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
      else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
    }
  }

  private fun addCover(activity: Activity) {
    if (cover != null) return
    val decor = activity.window.decorView as? ViewGroup ?: return
    val v = View(activity).apply {
      setBackgroundColor(Color.parseColor("#050506"))
      isClickable = false
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    decor.addView(v, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    cover = v
  }

  // A few frames after the screen comes on, so the screensaver (committed
  // while the screen was off) is on screen under it, then a short fade.
  private fun revealCover(framesLeft: Int = COVER_FRAMES) {
    val v = cover ?: return
    if (framesLeft > 0) {
      Choreographer.getInstance().postFrameCallback { revealCover(framesLeft - 1) }
      return
    }
    v.animate().alpha(0f).setDuration(COVER_FADE_MS).withEndAction { removeCover() }.start()
  }

  private fun removeCover() {
    val v = cover ?: return
    cover = null
    v.animate().cancel()
    (v.parent as? ViewGroup)?.removeView(v)
  }

  private fun clearOverLock() {
    overLock = false
    hostActivity?.let { setShowWhenLocked(it, false) }
    removeCover()
  }

  override fun definition() = ModuleDefinition {
    Name("BoaScreen")

    Events("onScreenChange")

    OnStartObserving {
      if (receiver != null) return@OnStartObserving
      val r = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
          val state = when (intent.action) {
            Intent.ACTION_SCREEN_OFF -> "off"
            Intent.ACTION_SCREEN_ON -> "on"
            Intent.ACTION_USER_PRESENT -> "unlocked"
            else -> return
          }
          if (state == "on" && overLock) hostActivity?.runOnUiThread { revealCover() }
          sendEvent("onScreenChange", mapOf("state" to state))
        }
      }
      val filter = IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_OFF)
        addAction(Intent.ACTION_SCREEN_ON)
        addAction(Intent.ACTION_USER_PRESENT)
      }
      // System broadcasts still reach a not-exported receiver.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        context.registerReceiver(r, filter)
      }
      receiver = r
    }

    OnStopObserving {
      receiver?.let { runCatching { context.unregisterReceiver(it) } }
      receiver = null
    }

    /** Whether the system lock screen is up (behind Zen or not). */
    Function("isLocked") {
      keyguard?.isKeyguardLocked == true
    }

    /** Shows the activity (now the Zen screensaver) over the lock screen. */
    AsyncFunction("showOverLock") {
      val a = hostActivity ?: return@AsyncFunction false
      setShowWhenLocked(a, true)
      // Only while the screen is off: covering a lit screen would blank it.
      val screenOn = (context.getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager)?.isInteractive == true
      if (!screenOn) addCover(a)
      overLock = true
      true
    }.runOnQueue(Queues.MAIN)

    /**
     * Leaves the lock screen: asks for the PIN or fingerprint if the phone
     * is locked. Resolves true once unlocked (the screensaver may then go
     * back to the app), false if the listener cancelled.
     */
    AsyncFunction("unlock") { promise: Promise ->
      val a = hostActivity
      val km = keyguard
      if (a == null || km == null || !km.isKeyguardLocked) {
        clearOverLock()
        promise.resolve(true)
        return@AsyncFunction
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        km.requestDismissKeyguard(a, object : KeyguardManager.KeyguardDismissCallback() {
          override fun onDismissSucceeded() {
            clearOverLock()
            promise.resolve(true)
          }
          override fun onDismissCancelled() = promise.resolve(false)
          override fun onDismissError() = promise.resolve(false)
        })
      } else {
        @Suppress("DEPRECATION")
        a.window.addFlags(WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD)
        clearOverLock()
        promise.resolve(true)
      }
    }.runOnQueue(Queues.MAIN)

    /** Stops showing over the lock screen (the screensaver ended unlocked). */
    AsyncFunction("clearOverLock") {
      clearOverLock()
    }.runOnQueue(Queues.MAIN)

    // Never leave the cover up if the screen-on broadcast went missing.
    OnActivityEntersForeground {
      if (cover != null) hostActivity?.runOnUiThread { revealCover() }
    }

    OnActivityDestroys {
      cover = null
      overLock = false
    }
  }

  companion object {
    private const val COVER_FRAMES = 3
    private const val COVER_FADE_MS = 260L
  }
}
