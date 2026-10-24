package __PACKAGE__

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.view.View
import android.widget.RemoteViews

/**
 * BOA Radio home screen widget: a pane of frosted glass with the BOA record,
 * a live clock and the date, and what's playing. The app saves the glass's
 * tint and opacity and the now-playing line to shared preferences (the
 * BoaWidget native module) and asks for a redraw; this reads them each
 * time it draws. The clock is a TextClock, kept current by the launcher.
 */
class BoaWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    val prefs = context.getSharedPreferences("boa_widget", Context.MODE_PRIVATE)
    val tint = parseColor(prefs.getString("color", null), DEFAULT_TINT)
    val opacity = prefs.getFloat("opacity", DEFAULT_OPACITY).coerceIn(0f, 1f)
    val title = prefs.getString("title", null)
    val subtitle = prefs.getString("subtitle", null)

    // Light glass that's mostly opaque gets dark text; anything else, light.
    val dark = luminance(tint) > 0.6 && opacity > 0.5f
    val primary = if (dark) Color.parseColor("#141416") else Color.parseColor("#F3EFE8")
    val secondary = if (dark) Color.parseColor("#B3141416") else Color.parseColor("#B3F3EFE8")
    val accent = if (dark) Color.parseColor("#9A6A22") else Color.parseColor("#E2A84B")

    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    }
    val tap = launch?.let {
      PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    for (id in appWidgetIds) {
      val views = RemoteViews(context.packageName, R.layout.boa_widget)
      views.setInt(R.id.boa_widget_glass, "setColorFilter", tint or OPAQUE)
      views.setInt(R.id.boa_widget_glass, "setImageAlpha", (opacity * 255).toInt())
      views.setTextColor(R.id.boa_widget_time, primary)
      views.setTextColor(R.id.boa_widget_date, secondary)
      views.setTextColor(R.id.boa_widget_title, accent)
      views.setTextColor(R.id.boa_widget_subtitle, secondary)
      views.setTextViewText(R.id.boa_widget_title, title?.uppercase() ?: context.getString(R.string.boa_widget_cta))
      if (subtitle.isNullOrBlank()) {
        views.setViewVisibility(R.id.boa_widget_subtitle, View.GONE)
      } else {
        views.setTextViewText(R.id.boa_widget_subtitle, subtitle)
        views.setViewVisibility(R.id.boa_widget_subtitle, View.VISIBLE)
      }
      if (tap != null) views.setOnClickPendingIntent(R.id.boa_widget_root, tap)
      appWidgetManager.updateAppWidget(id, views)
    }
  }

  private fun parseColor(hex: String?, fallback: Int): Int =
    try {
      if (hex == null) fallback else Color.parseColor(hex)
    } catch (e: IllegalArgumentException) {
      fallback
    }

  private fun luminance(color: Int): Double =
    (0.2126 * Color.red(color) + 0.7152 * Color.green(color) + 0.0722 * Color.blue(color)) / 255.0

  companion object {
    private val DEFAULT_TINT = Color.parseColor("#141416")
    private const val DEFAULT_OPACITY = 0.55f
    private const val OPAQUE = 0xFF000000.toInt()
  }
}
