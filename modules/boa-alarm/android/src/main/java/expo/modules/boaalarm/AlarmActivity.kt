package expo.modules.boaalarm

import android.animation.Animator
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.RenderEffect
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.text.format.DateFormat
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextClock
import android.widget.TextView
import androidx.annotation.RequiresApi
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.widget.TextViewCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The alarm page: over the lock screen with the screen lit, the time in large
 * gold type over slowly drifting, blurred light, what is playing, and Stop and
 * Snooze, all without opening the app. Drawn in code so it needs no
 * JavaScript and appears even if the app isn't running. Its look is one of
 * AlarmTheme's six, chosen in the app's Alarm Settings.
 *
 * (If Android wouldn't let the service start from the background, this page,
 * being in front, starts it.)
 *
 * With EXTRA_PREVIEW it is only a preview of a theme: no alarm, no service,
 * and every button just closes it.
 */
class AlarmActivity : Activity() {
  companion object {
    const val EXTRA_PREVIEW = "preview"
    const val EXTRA_THEME = "theme"
  }

  private var preview = false
  private var listening = false
  private val animators = mutableListOf<Animator>()

  private val closer = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      val s = intent.getStringExtra(AlarmService.EXTRA_STATE)
      if (s == "stopped" || s == "snoozed") finish()
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    preview = intent.getBooleanExtra(EXTRA_PREVIEW, false)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    val a = if (preview) {
      AlarmStore.Alarm("preview", "Good morning", 0, 0, emptyList(), "BOA Radio", "")
    } else {
      AlarmService.readAlarm(intent) ?: AlarmService.current
    }
    if (a == null) {
      finish()
      return
    }
    if (!preview) {
      // From the front, Android lets the service start if the system held it back.
      if (AlarmService.current == null) AlarmService.start(this, a)
      ContextCompat.registerReceiver(this, closer, IntentFilter(AlarmService.ACTION_STATE), ContextCompat.RECEIVER_NOT_EXPORTED)
      listening = true
    }
    val theme = AlarmTheme.byId(if (preview) intent.getStringExtra(EXTRA_THEME) else AlarmStore.theme(this))
    setContentView(content(a, theme))
    edgeToEdge(theme)
  }

  // A second preview (another theme) arrives while this one is open.
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    if (intent.getBooleanExtra(EXTRA_PREVIEW, false)) recreate()
  }

  override fun onDestroy() {
    animators.forEach { it.cancel() }
    animators.clear()
    if (listening) {
      try {
        unregisterReceiver(closer)
      } catch (_: Exception) {
      }
      listening = false
    }
    super.onDestroy()
  }

  @RequiresApi(Build.VERSION_CODES.S)
  private fun blur(v: View, radius: Float) {
    v.setRenderEffect(RenderEffect.createBlurEffect(radius, radius, Shader.TileMode.CLAMP))
  }

  private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

  /** The page runs under the status and navigation bars, whose icons suit the theme. */
  @Suppress("DEPRECATION")
  private fun edgeToEdge(t: AlarmTheme) {
    WindowCompat.setDecorFitsSystemWindows(window, false)
    window.statusBarColor = Color.TRANSPARENT
    window.navigationBarColor = Color.TRANSPARENT
    val controller = WindowCompat.getInsetsController(window, window.decorView)
    controller.isAppearanceLightStatusBars = t.light
    controller.isAppearanceLightNavigationBars = t.light
  }

  private fun content(a: AlarmStore.Alarm, t: AlarmTheme): View {
    val dm = resources.displayMetrics
    val screenW = dm.widthPixels
    val screenH = dm.heightPixels

    val root = FrameLayout(this).apply {
      background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(t.bgTop, t.bgBottom))
    }

    // Large soft glows behind everything. Each is a radial gradient that fades
    // to nothing at its rim, drifting slowly; on Android 12+ the layer is also
    // blurred, so the light has no shape at all.
    val orbLayer = FrameLayout(this)
    root.addView(orbLayer, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    t.orbs.forEachIndexed { i, o ->
      val d = (maxOf(screenW, screenH) * o.size).toInt()
      val glow = GradientDrawable()
      glow.setShape(GradientDrawable.OVAL)
      glow.setGradientType(GradientDrawable.RADIAL_GRADIENT)
      glow.setGradientRadius(d / 2f)
      glow.setColors(intArrayOf(o.color, o.color and 0x00FFFFFF))
      val v = View(this)
      v.background = glow
      v.alpha = 0f
      orbLayer.addView(v, FrameLayout.LayoutParams(d, d))
      val baseX = o.x * screenW - d / 2f
      val baseY = o.y * screenH - d / 2f
      v.translationX = baseX
      v.translationY = baseY
      v.animate().alpha(1f).setDuration(1600).setStartDelay(i * 200L).start()
      fun drift(prop: android.util.Property<View, Float>, from: Float, to: Float, ms: Long) {
        val anim = ObjectAnimator.ofFloat(v, prop, from, to)
        anim.duration = ms
        anim.repeatMode = ValueAnimator.REVERSE
        anim.repeatCount = ValueAnimator.INFINITE
        anim.interpolator = AccelerateDecelerateInterpolator()
        anim.start()
        animators.add(anim)
      }
      drift(View.TRANSLATION_X, baseX - dp(28), baseX + dp(28), 9000L + i * 2300L)
      drift(View.TRANSLATION_Y, baseY + dp(22), baseY - dp(22), 11000L + i * 1700L)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && t.orbs.isNotEmpty()) {
      blur(orbLayer, dp(40).toFloat())
    }

    val column = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(dp(28), dp(56), dp(28), dp(36))
    }
    root.addView(column, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    ViewCompat.setOnApplyWindowInsetsListener(column) { v, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      v.setPadding(dp(28), bars.top + dp(32), dp(28), bars.bottom + dp(28))
      insets
    }

    // What rises into place, in order, when the page opens.
    val reveal = mutableListOf<View>()
    fun add(v: View, lp: LinearLayout.LayoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)) {
      column.addView(v, lp)
      reveal.add(v)
    }
    fun spacer(weight: Float) = column.addView(View(this), LinearLayout.LayoutParams(1, 0, weight))
    fun label(s: String, sp: Float, color: Int, spacing: Float = 0f, face: Typeface? = null) = TextView(this).apply {
      text = s
      setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
      setTextColor(color)
      gravity = Gravity.CENTER
      letterSpacing = spacing
      if (face != null) typeface = face
    }

    // BOA ALARM, between two hairlines.
    val brand = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }
    fun hairline() = View(this).apply { setBackgroundColor(t.accent and 0x00FFFFFF or 0x88000000.toInt()) }
    brand.addView(hairline(), LinearLayout.LayoutParams(dp(26), dp(1)))
    brand.addView(
      label(if (preview) "BOA ALARM · PREVIEW" else "BOA ALARM", 11f, t.accent, 0.34f, Typeface.create("sans-serif-medium", Typeface.NORMAL)),
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { setMargins(dp(12), 0, dp(12), 0) },
    )
    brand.addView(hairline(), LinearLayout.LayoutParams(dp(26), dp(1)))
    add(brand)

    spacer(1f)

    // The date, then the time: large, thin, in a gold gradient with a soft glow.
    add(
      label(SimpleDateFormat("EEEE d MMMM", Locale.getDefault()).format(Date()).uppercase(Locale.getDefault()), 12f, t.muted, 0.3f, Typeface.create("sans-serif-medium", Typeface.NORMAL)),
    )
    val clock = TextClock(this).apply {
      format12Hour = "h:mm"
      format24Hour = "HH:mm"
      typeface = Typeface.create("sans-serif-thin", Typeface.NORMAL)
      includeFontPadding = false
      letterSpacing = -0.03f
      gravity = Gravity.CENTER
      maxLines = 1
      setTextColor(t.timeFrom)
      setShadowLayer(dp(22).toFloat(), 0f, 0f, (t.accent and 0x00FFFFFF) or (if (t.light) 0x33000000 else 0x66000000))
    }
    // Always one line, whatever the phone's font size: it shrinks before it would wrap.
    TextViewCompat.setAutoSizeTextTypeUniformWithConfiguration(clock, 64, 120, 2, TypedValue.COMPLEX_UNIT_SP)
    clock.post {
      val h = clock.height.toFloat().coerceAtLeast(1f)
      clock.paint.shader = LinearGradient(0f, 0f, 0f, h, t.timeFrom, t.timeTo, Shader.TileMode.CLAMP)
      clock.invalidate()
    }
    add(clock, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(10) })
    if (!DateFormat.is24HourFormat(this)) {
      val period = TextClock(this).apply {
        format12Hour = "a"
        format24Hour = "a"
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
        setTextColor(t.accent)
        letterSpacing = 0.3f
        gravity = Gravity.CENTER
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
      }
      add(period)
    }

    // The alarm's name, in the serif italic of the BOA mark, and what's playing.
    add(
      label(a.name.ifEmpty { "Wake up" }, 28f, t.text, 0f, Typeface.create("serif", Typeface.ITALIC)).apply { maxLines = 2 },
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(22) },
    )
    add(
      label(if (a.station.isNotEmpty()) "Waking you to ${a.station}" else "Time to wake up", 14f, t.muted, 0.02f).apply { maxLines = 2 },
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(8) },
    )

    spacer(1.15f)

    // Buttons: the lit one first (Stop), a frosted glass one under it.
    val bw = minOf(screenW - dp(56), dp(420))
    val bigH = dp(64)
    val smallH = dp(56)
    fun pill(text: String, h: Int, fill: Drawable, textColor: Int, ripple: Int, onClick: () -> Unit) = TextView(this).apply {
      this.text = text
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
      setTextColor(textColor)
      gravity = Gravity.CENTER
      letterSpacing = 0.03f
      typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
      background = fill
      val mask = GradientDrawable()
      mask.setColor(Color.WHITE)
      mask.setCornerRadius(h / 2f)
      foreground = RippleDrawable(ColorStateList.valueOf(ripple), null, mask)
      isClickable = true
      isFocusable = true
      setOnClickListener { onClick() }
    }

    val lit = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(t.buttonFrom, t.buttonTo))
    lit.setCornerRadius(bigH / 2f)
    val stop = pill("Stop", bigH, lit, t.buttonText, Color.argb(70, 255, 255, 255)) {
      if (preview) finish() else AlarmService.command(this, AlarmService.ACTION_STOP)
    }
    stop.elevation = dp(12).toFloat()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      stop.outlineSpotShadowColor = t.accent
      stop.outlineAmbientShadowColor = t.accent
    }
    add(stop, LinearLayout.LayoutParams(bw, bigH))

    val glass = GradientDrawable()
    glass.setColor(t.glass)
    glass.setCornerRadius(smallH / 2f)
    glass.setStroke(dp(1), t.glassStroke)
    val snooze = pill("Snooze  ·  ${AlarmService.SNOOZE_MINUTES} min", smallH, glass, t.text, if (t.light) Color.argb(50, 0, 0, 0) else Color.argb(50, 255, 255, 255)) {
      if (preview) finish() else AlarmService.command(this, AlarmService.ACTION_SNOOZE)
    }
    add(snooze, LinearLayout.LayoutParams(bw, smallH).apply { topMargin = dp(14) })

    val open = label(if (preview) "Close preview" else "Open BOA", 14f, t.muted, 0.04f, Typeface.create("sans-serif-medium", Typeface.NORMAL)).apply {
      setPadding(dp(20), dp(14), dp(20), dp(6))
      isClickable = true
      isFocusable = true
      setOnClickListener {
        if (!preview) {
          val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            data = Uri.parse("network.boa://alarm/${a.id}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          if (launch != null) startActivity(launch)
        }
        finish()
      }
    }
    add(open, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(8) })

    // Everything rises and fades in, one after another.
    reveal.forEachIndexed { i, v ->
      v.alpha = 0f
      v.translationY = dp(18).toFloat()
      v.animate().alpha(1f).translationY(0f).setStartDelay(150L + i * 90L).setDuration(700).setInterpolator(DecelerateInterpolator()).start()
    }
    return root
  }
}
