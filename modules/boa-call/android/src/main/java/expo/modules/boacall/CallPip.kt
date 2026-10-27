package expo.modules.boacall

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Rational
import androidx.core.app.OnPictureInPictureModeChangedProvider
import androidx.core.app.PictureInPictureModeChangedInfo
import androidx.core.util.Consumer
import expo.modules.core.interfaces.ReactActivityLifecycleListener
import java.lang.ref.WeakReference

/**
 * System picture in picture for a live call: leave the app mid-call (Home,
 * or a swipe to another app) and the call carries on in a small floating
 * window over everything, their picture in it, like WhatsApp and FaceTime.
 * Tap the window to come back to the full call.
 *
 * JS says when a call is on (BoaCall.setPipReady). Android 12+ then goes
 * into the window by itself as you leave (auto-enter, a smooth animation
 * from the full screen); Android 8 to 11 is asked to on the way out
 * (onUserLeaveHint). Going in and out is reported to JS (onPipChange), which
 * draws the call alone, edge to edge, while it's in the window.
 */
object CallPip : ReactActivityLifecycleListener {
  private var activity = WeakReference<Activity>(null)
  private var ready = false
  private var watching: WeakReference<Activity> = WeakReference(null)
  // Set while the module (and so JS) is alive.
  @Volatile var onChange: ((Boolean) -> Unit)? = null

  private val listener = Consumer<PictureInPictureModeChangedInfo> { info -> onChange?.invoke(info.isInPictureInPictureMode) }

  /** Whether this phone does picture in picture at all (some low-memory ones don't). */
  fun supported(a: Activity?): Boolean =
    a != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && a.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)

  // A portrait window: a face on a phone call.
  private fun params(): PictureInPictureParams? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null
    val b = PictureInPictureParams.Builder().setAspectRatio(Rational(9, 16))
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      b.setAutoEnterEnabled(ready)
      b.setSeamlessResizeEnabled(true)
    }
    return b.build()
  }

  /** A call is on (true) or over (false). Main thread. */
  fun setReady(on: Boolean) {
    ready = on
    val a = activity.get() ?: return
    if (!supported(a)) return
    watch(a)
    runCatching { params()?.let { a.setPictureInPictureParams(it) } }
  }

  private fun watch(a: Activity) {
    if (watching.get() === a) return
    (watching.get() as? OnPictureInPictureModeChangedProvider)?.removeOnPictureInPictureModeChangedListener(listener)
    (a as? OnPictureInPictureModeChangedProvider)?.addOnPictureInPictureModeChangedListener(listener)
    watching = WeakReference(a)
  }

  override fun onCreate(activity: Activity?, savedInstanceState: Bundle?) {
    activity ?: return
    this.activity = WeakReference(activity)
    if (ready) setReady(true)
  }

  override fun onResume(activity: Activity?) {
    activity ?: return
    this.activity = WeakReference(activity)
  }

  // Android 8 to 11: no auto-enter, so go in as you leave.
  override fun onUserLeaveHint(activity: Activity?) {
    val a = activity ?: return
    if (!ready || !supported(a) || Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) return
    runCatching { params()?.let { a.enterPictureInPictureMode(it) } }
  }

  override fun onDestroy(activity: Activity?) {
    if (watching.get() === activity) {
      (activity as? OnPictureInPictureModeChangedProvider)?.removeOnPictureInPictureModeChangedListener(listener)
      watching = WeakReference(null)
    }
    if (this.activity.get() === activity) this.activity = WeakReference(null)
  }
}
