package expo.modules.boaalarm

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import java.text.DateFormat
import java.util.Date

/**
 * The alarm page: over the lock screen with the screen lit, the time, what
 * is playing, and Snooze and Stop, all without opening the app. Drawn in
 * code so it needs no JavaScript and appears even if the app isn't running.
 * (If Android wouldn't let the service start from the background, this
 * page, being in front, starts it.)
 */
class AlarmActivity : Activity() {
  private val closer = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      val s = intent.getStringExtra(AlarmService.EXTRA_STATE)
      if (s == "stopped" || s == "snoozed") finish()
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    val a = AlarmService.readAlarm(intent) ?: AlarmService.current
    if (a == null) {
      finish()
      return
    }
    // From the front, Android lets the service start if the system held it back.
    if (AlarmService.current == null) AlarmService.start(this, a)
    ContextCompat.registerReceiver(this, closer, IntentFilter(AlarmService.ACTION_STATE), ContextCompat.RECEIVER_NOT_EXPORTED)
    setContentView(content(a))
  }

  override fun onDestroy() {
    try {
      unregisterReceiver(closer)
    } catch (_: Exception) {
    }
    super.onDestroy()
  }

  private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

  private fun content(a: AlarmStore.Alarm): View {
    val gold = Color.parseColor("#E2A84B")
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.parseColor("#050506"))
      setPadding(dp(32), dp(48), dp(32), dp(48))
    }
    fun text(s: String, size: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
      this.text = s
      textSize = size
      setTextColor(color)
      gravity = Gravity.CENTER
      if (bold) typeface = Typeface.DEFAULT_BOLD
    }
    root.addView(text("BOA ALARM", 12f, gold, true).apply { letterSpacing = 0.2f })
    root.addView(text(DateFormat.getTimeInstance(DateFormat.SHORT).format(Date()), 64f, Color.parseColor("#F3EFE8")).apply {
      typeface = Typeface.create("sans-serif-light", Typeface.NORMAL)
      setPadding(0, dp(12), 0, dp(4))
    })
    root.addView(text(a.name.ifEmpty { "Wake up" }, 20f, Color.parseColor("#F3EFE8"), true))
    if (a.station.isNotEmpty()) root.addView(text("Waking up to ${a.station}", 15f, Color.parseColor("#A9A49B")).apply { setPadding(0, dp(6), 0, 0) })

    fun button(label: String, filled: Boolean, onClick: () -> Unit) = Button(this).apply {
      this.text = label
      isAllCaps = false
      textSize = 17f
      typeface = Typeface.DEFAULT_BOLD
      setTextColor(if (filled) Color.parseColor("#050506") else Color.parseColor("#F3EFE8"))
      background = GradientDrawable().apply {
        cornerRadius = dp(32).toFloat()
        if (filled) setColor(gold) else {
          setColor(Color.TRANSPARENT)
          setStroke(dp(1), Color.parseColor("#55F3EFE8"))
        }
      }
      setOnClickListener { onClick() }
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(60)).apply { topMargin = dp(16) }
    }
    root.addView(View(this), LinearLayout.LayoutParams(1, dp(40)))
    root.addView(button("Snooze ${AlarmService.SNOOZE_MINUTES} min", false) { AlarmService.command(this, AlarmService.ACTION_SNOOZE) })
    root.addView(button("Stop", true) { AlarmService.command(this, AlarmService.ACTION_STOP) })
    root.addView(button("Open BOA", false) {
      val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
        data = Uri.parse("network.boa://alarm/${a.id}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      if (launch != null) startActivity(launch)
      finish()
    })
    return root
  }
}
