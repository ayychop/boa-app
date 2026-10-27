package expo.modules.boacall

import android.animation.ObjectAnimator
import android.animation.PropertyValuesHolder
import android.animation.ValueAnimator
import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.graphics.drawable.RoundedBitmapDrawableFactory
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import java.lang.ref.WeakReference
import java.net.URL

/**
 * BOA's incoming call screen, native and instant: what a locked or
 * sleeping phone wakes to (the ringing notification's full-screen intent).
 * It shows over the lock screen and turns the screen on, like the phone's
 * own call screen: the caller's photo in a breathing gold ring, their
 * name, and Decline and Answer. No React Native here, so it's up the
 * moment the screen lights, even when the app was closed.
 *
 * Answer stops the ring and opens the app on the call, answered (still
 * over the lock screen: CallLockScreen). Decline tells the caller. Back
 * leaves it ringing in the notification, as a phone call would.
 */
class IncomingCallActivity : Activity() {
  private var pulse: ValueAnimator? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val call = CallInfo.from(intent) ?: return finish()
    if (intent.action == ACTION_ANSWER) return answer(call)
    current = WeakReference(this)
    overLockScreen()
    setContentView(build(call))
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    val call = CallInfo.from(intent) ?: return
    if (intent.action == ACTION_ANSWER) return answer(call)
    pulse?.cancel()
    setContentView(build(call))
  }

  override fun onDestroy() {
    pulse?.cancel()
    if (current.get() === this) current = WeakReference(null)
    super.onDestroy()
  }

  @Deprecated("Back leaves the call ringing in the notification")
  override fun onBackPressed() {
    moveTaskToBack(true)
  }

  private fun overLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    // Edge to edge: the picture runs under the status and navigation bars.
    WindowCompat.setDecorFitsSystemWindows(window, false)
    @Suppress("DEPRECATION")
    window.statusBarColor = Color.TRANSPARENT
    @Suppress("DEPRECATION")
    window.navigationBarColor = Color.TRANSPARENT
  }

  private fun answer(call: CallInfo) {
    IncomingCallService.stop(this)
    CallNotification.appIntent(this, call.acceptLink)?.let { runCatching { startActivity(it) } }
    finish()
    @Suppress("DEPRECATION")
    overridePendingTransition(0, 0)
  }

  private fun decline(call: CallInfo) {
    sendBroadcast(Intent(this, CallDeclineReceiver::class.java).putExtra(CallDeclineReceiver.EXTRA_CALL_ID, call.callId))
    IncomingCallService.stop(this)
    finish()
  }

  // ------------------------------------------------------------- the look

  private fun dp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics)
  private fun dpi(v: Float) = dp(v).toInt()

  private fun text(value: String, sp: Float, color: Int, bold: Boolean = false, spacing: Float = 0f) = TextView(this).apply {
    text = value
    setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
    setTextColor(color)
    gravity = Gravity.CENTER
    letterSpacing = spacing
    typeface = if (bold) Typeface.create("sans-serif-medium", Typeface.BOLD) else Typeface.create("sans-serif", Typeface.NORMAL)
  }

  /** A round button: a handset in a disc (turned down for Decline), its word under it. */
  private fun action(label: String, color: Int, glow: Int, rotate: Float, onTap: () -> Unit): View {
    val size = dpi(80f)
    val disc = FrameLayout(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(color)
        setStroke(dpi(1.5f), glow)
      }
      elevation = dp(10f)
      contentDescription = label
      isClickable = true
      isFocusable = true
      setOnClickListener { onTap() }
      addView(
        ImageView(this@IncomingCallActivity).apply {
          setImageResource(android.R.drawable.sym_action_call)
          setColorFilter(Color.WHITE)
          rotation = rotate
          scaleType = ImageView.ScaleType.FIT_CENTER
        },
        FrameLayout.LayoutParams(dpi(34f), dpi(34f), Gravity.CENTER),
      )
    }
    return LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      addView(disc, LinearLayout.LayoutParams(size, size))
      addView(text(label, 14f, Color.WHITE, bold = true), LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { topMargin = dpi(12f) })
    }
  }

  private fun build(call: CallInfo): View {
    val root = FrameLayout(this).apply {
      // Near-black with a low gold light from the top, the BOA call look.
      background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(Color.parseColor("#2A1C08"), Color.parseColor("#0B0906"), Color.parseColor("#050506")))
    }
    val column = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
    }
    column.addView(text("BOA VIDEO  ·  HD", 11f, GOLD_LIGHT, spacing = 0.3f).apply { typeface = Typeface.MONOSPACE }, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))

    // The caller: their photo (or the BOA logo) in a gold ring that breathes.
    val face = dpi(148f)
    val ring = dpi(14f)
    val avatar = ImageView(this).apply {
      scaleType = ImageView.ScaleType.CENTER_CROP
      setImageDrawable(round(CallNotification.logo(this@IncomingCallActivity)))
      clipToOutline = true
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor("#16130E"))
      }
    }
    val halo = View(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setStroke(dpi(2f), GOLD)
        setColor(Color.argb(28, 226, 168, 75))
      }
    }
    val portrait = FrameLayout(this).apply {
      addView(halo, FrameLayout.LayoutParams(face + ring * 2, face + ring * 2, Gravity.CENTER))
      addView(avatar, FrameLayout.LayoutParams(face, face, Gravity.CENTER))
    }
    pulse = ObjectAnimator.ofPropertyValuesHolder(halo, PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.08f), PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.08f), PropertyValuesHolder.ofFloat(View.ALPHA, 1f, 0.55f)).apply {
      duration = 1100
      repeatCount = ValueAnimator.INFINITE
      repeatMode = ValueAnimator.REVERSE
      start()
    }
    column.addView(portrait, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { topMargin = dpi(56f) })
    column.addView(text(call.name, 32f, Color.WHITE, bold = true).apply { maxLines = 2 }, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = dpi(28f) })
    column.addView(text("Incoming video call", 16f, GOLD_LIGHT), LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = dpi(8f) })

    val actions = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      addView(action("Decline", RED, Color.argb(120, 255, 59, 78), 135f) { decline(call) }, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
      addView(action("Answer", GREEN, GOLD, 0f) { answer(call) }, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
    }

    root.addView(column, FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT, Gravity.TOP))
    root.addView(actions, FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT, Gravity.BOTTOM))
    // Clear of the status bar, the cut-out and the navigation bar.
    ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      column.setPadding(dpi(24f), bars.top + dpi(32f), dpi(24f), 0)
      actions.setPadding(dpi(24f), 0, dpi(24f), bars.bottom + dpi(48f))
      insets
    }
    loadPhoto(call.avatar, avatar)
    return root
  }

  private fun round(bitmap: Bitmap?) = bitmap?.let { RoundedBitmapDrawableFactory.create(resources, it).apply { isCircular = true } }

  /** Their photo, fetched off the main thread; the logo stays if it can't be had. */
  private fun loadPhoto(url: String, into: ImageView) {
    if (!url.startsWith("https://")) return
    Thread {
      val bitmap = runCatching { URL(url).openStream().use { BitmapFactory.decodeStream(it) } }.getOrNull() ?: return@Thread
      runOnUiThread { if (!isFinishing && !isDestroyed) into.setImageDrawable(round(bitmap)) }
    }.start()
  }

  companion object {
    const val ACTION_ANSWER = "expo.modules.boacall.ANSWER"
    private val GOLD = Color.parseColor("#E2A84B")
    private val GOLD_LIGHT = Color.parseColor("#F6D38A")
    private val RED = Color.parseColor("#FF3B4E")
    private val GREEN = Color.parseColor("#2BD576")
    private var current = WeakReference<IncomingCallActivity>(null)

    /** Closes the call screen if it's up (the ring is over). */
    fun close() {
      current.get()?.let { a -> a.runOnUiThread { if (!a.isFinishing) a.finish() } }
    }
  }
}
