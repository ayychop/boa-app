package expo.modules.boacall

import android.app.Activity
import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
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
 * The window is too small for the in-app controls, so it carries native
 * floating buttons instead (setActions): Mute, which toggles between a mic
 * and a struck-through mic, Chat (back to this person's chat, the picture
 * carrying on in the app's own small window) and End. A tap on one broadcasts to
 * CallPipReceiver and reaches JS, which mutes or ends the call. JS keeps the
 * Mute button in step with the real state (setMuted). So the window only ever
 * shows the call: their video (or a black screen with their photo when the
 * camera is off) and those two buttons, never app chrome or media controls.
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
  private var muted = false
  private var watching: WeakReference<Activity> = WeakReference(null)
  // Set while the module (and so JS) is alive.
  @Volatile var onChange: ((Boolean) -> Unit)? = null

  private val listener = Consumer<PictureInPictureModeChangedInfo> { info -> onChange?.invoke(info.isInPictureInPictureMode) }

  /** Whether this phone does picture in picture at all (some low-memory ones don't). */
  fun supported(a: Activity?): Boolean =
    a != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && a.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)

  // A portrait window with Mute and End on it: a face on a phone call.
  private fun params(a: Activity): PictureInPictureParams? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null
    val b = PictureInPictureParams.Builder().setAspectRatio(Rational(9, 16))
    // The buttons are a nicety: if they can't be built, the call still floats.
    runCatching { b.setActions(listOf(muteAction(a), chatAction(a), endAction(a))) }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      b.setAutoEnterEnabled(ready)
      b.setSeamlessResizeEnabled(true)
    }
    return b.build()
  }

  private fun muteAction(ctx: Context): RemoteAction {
    val icon = Icon.createWithResource(ctx, if (muted) R.drawable.ic_pip_mic else R.drawable.ic_pip_mic_off)
    val title = if (muted) "Unmute" else "Mute"
    return RemoteAction(icon, title, title, broadcast(ctx, CallPipReceiver.ACTION_PIP_MUTE, REQUEST_MUTE))
  }

  // Back to the chat with this person, so you can type while the picture carries on.
  private fun chatAction(ctx: Context): RemoteAction {
    val icon = Icon.createWithResource(ctx, R.drawable.ic_pip_chat)
    return RemoteAction(icon, "Chat", "Go to chat", broadcast(ctx, CallPipReceiver.ACTION_PIP_CHAT, REQUEST_CHAT))
  }

  private fun endAction(ctx: Context): RemoteAction {
    val icon = Icon.createWithResource(ctx, R.drawable.ic_pip_end)
    return RemoteAction(icon, "End", "End call", broadcast(ctx, CallPipReceiver.ACTION_PIP_END, REQUEST_END))
  }

  private fun broadcast(ctx: Context, action: String, request: Int): PendingIntent {
    val intent = Intent(ctx, CallPipReceiver::class.java).setAction(action)
    return PendingIntent.getBroadcast(ctx, request, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  /** A call is on (true) or over (false). Main thread. */
  fun setReady(on: Boolean) {
    ready = on
    if (!on) muted = false
    val a = activity.get() ?: return
    if (!supported(a)) return
    watch(a)
    runCatching { params(a)?.let { a.setPictureInPictureParams(it) } }
  }

  /**
   * Floats the call now (the phone's Back button on the call screen). False
   * if there's no call, or this phone doesn't do picture in picture.
   */
  fun enter(a: Activity?): Boolean {
    a ?: return false
    if (!ready || !supported(a) || a.isInPictureInPictureMode) return false
    return runCatching { params(a)?.let { a.enterPictureInPictureMode(it) } ?: false }.getOrDefault(false)
  }

  /** The call's mute state changed: redraw the window's Mute button to match. */
  fun setMuted(on: Boolean) {
    if (muted == on) return
    muted = on
    val a = activity.get() ?: return
    if (!supported(a)) return
    runCatching { params(a)?.let { a.setPictureInPictureParams(it) } }
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

  // Home (or a swipe to another app) with a call on: float it. Android 12+
  // auto-enters by itself on gesture navigation, but not on every phone or
  // with the three-button bar (Samsung's One UI included), so this asks
  // too. It does nothing if the window is already there.
  override fun onUserLeaveHint(activity: Activity?) {
    val a = activity ?: return
    if (!ready || !supported(a) || a.isInPictureInPictureMode) return
    runCatching { params(a)?.let { a.enterPictureInPictureMode(it) } }
  }

  override fun onDestroy(activity: Activity?) {
    if (watching.get() === activity) {
      (activity as? OnPictureInPictureModeChangedProvider)?.removeOnPictureInPictureModeChangedListener(listener)
      watching = WeakReference(null)
    }
    if (this.activity.get() === activity) this.activity = WeakReference(null)
  }

  private const val REQUEST_MUTE = 71
  private const val REQUEST_END = 72
  private const val REQUEST_CHAT = 73
}
