package __PACKAGE__

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import java.io.File

/**
 * BOA home screen widget: a pane of frosted glass with a live clock and the
 * date, today's weather and what's playing. The app saves everything it
 * shows to shared preferences (the BoaWidget native module) and asks for a
 * redraw; this reads them each time it draws:
 * - the glass's tint and opacity;
 * - the station and song, and the station's record artwork (a PNG the app
 *   renders, with the station's logo as the label). With nothing playing it
 *   shows the BOA Network logo instead;
 * - the weather (icon, temperature, place, rain outlook).
 * The clock is a TextClock, kept current by the launcher. Tapping the
 * weather opens the forecast (boa://weather); anywhere else opens what's
 * playing (boa://now-playing: the Radio tab when a station is on).
 */
class BoaWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    val prefs = context.getSharedPreferences("boa_widget", Context.MODE_PRIVATE)
    val tint = parseColor(prefs.getString("color", null), DEFAULT_TINT)
    val opacity = prefs.getFloat("opacity", DEFAULT_OPACITY).coerceIn(0f, 1f)
    val title = prefs.getString("title", null)
    val subtitle = prefs.getString("subtitle", null)
    val playing = prefs.getBoolean("playing", false)
    val art = if (title != null) loadArt(prefs.getString("artwork", null)) else null

    val wxTemp = prefs.getString("wx_temp", null)
    val wxIcon = prefs.getString("wx_icon", null)
    val wxPlace = prefs.getString("wx_place", null)
    val wxDetail = prefs.getString("wx_detail", null)

    // Light glass that's mostly opaque gets dark text; anything else, light.
    val dark = luminance(tint) > 0.6 && opacity > 0.5f
    val primary = if (dark) Color.parseColor("#141416") else Color.parseColor("#F3EFE8")
    val secondary = if (dark) Color.parseColor("#B3141416") else Color.parseColor("#B3F3EFE8")
    val accent = if (dark) Color.parseColor("#9A6A22") else Color.parseColor("#E2A84B")
    val rule = if (dark) Color.parseColor("#1F141416") else Color.parseColor("#1FF3EFE8")

    val openPlaying = deepLink(context, "boa://now-playing", 0)
    val openWeather = deepLink(context, "boa://weather", 1)

    for (id in appWidgetIds) {
      val views = RemoteViews(context.packageName, R.layout.boa_widget)
      views.setInt(R.id.boa_widget_glass, "setColorFilter", tint or OPAQUE)
      views.setInt(R.id.boa_widget_glass, "setImageAlpha", (opacity * 255).toInt())
      views.setTextColor(R.id.boa_widget_time, primary)
      views.setTextColor(R.id.boa_widget_date, secondary)
      views.setTextColor(R.id.boa_widget_wx_temp, primary)
      views.setTextColor(R.id.boa_widget_wx_place, primary)
      views.setTextColor(R.id.boa_widget_wx_detail, secondary)
      views.setTextColor(R.id.boa_widget_title, accent)
      views.setTextColor(R.id.boa_widget_subtitle, secondary)
      views.setInt(R.id.boa_widget_rule, "setBackgroundColor", rule)

      // Weather: the icon tinted to the text, or a prompt until there is any.
      if (wxTemp != null) {
        views.setTextViewText(R.id.boa_widget_wx_temp, wxTemp)
        views.setImageViewResource(R.id.boa_widget_wx_icon, iconFor(wxIcon))
        views.setInt(R.id.boa_widget_wx_icon, "setColorFilter", if (wxIcon == "sun") accent else primary)
        views.setViewVisibility(R.id.boa_widget_wx_icon, View.VISIBLE)
        views.setTextViewText(R.id.boa_widget_wx_place, wxPlace ?: "")
      } else {
        views.setTextViewText(R.id.boa_widget_wx_temp, context.getString(R.string.boa_widget_wx_blank))
        views.setViewVisibility(R.id.boa_widget_wx_icon, View.GONE)
        views.setTextViewText(R.id.boa_widget_wx_place, context.getString(R.string.boa_widget_wx_setup))
      }
      if (wxTemp != null && !wxDetail.isNullOrBlank()) {
        views.setTextViewText(R.id.boa_widget_wx_detail, wxDetail)
        views.setViewVisibility(R.id.boa_widget_wx_detail, View.VISIBLE)
      } else {
        views.setViewVisibility(R.id.boa_widget_wx_detail, View.GONE)
      }

      // What's playing: the station's record, else the BOA logo.
      if (art != null) {
        views.setImageViewBitmap(R.id.boa_widget_art, art)
        views.setViewVisibility(R.id.boa_widget_art, View.VISIBLE)
        views.setViewVisibility(R.id.boa_widget_logo, View.GONE)
      } else {
        views.setViewVisibility(R.id.boa_widget_art, View.GONE)
        views.setViewVisibility(R.id.boa_widget_logo, View.VISIBLE)
      }
      views.setTextViewText(R.id.boa_widget_title, title?.uppercase() ?: context.getString(R.string.boa_widget_cta))
      if (subtitle.isNullOrBlank()) {
        views.setViewVisibility(R.id.boa_widget_subtitle, View.GONE)
      } else {
        views.setTextViewText(R.id.boa_widget_subtitle, subtitle)
        views.setViewVisibility(R.id.boa_widget_subtitle, View.VISIBLE)
      }
      views.setViewVisibility(R.id.boa_widget_live, if (playing && title != null) View.VISIBLE else View.GONE)

      if (openPlaying != null) views.setOnClickPendingIntent(R.id.boa_widget_root, openPlaying)
      if (openPlaying != null) views.setOnClickPendingIntent(R.id.boa_widget_media, openPlaying)
      if (openWeather != null) views.setOnClickPendingIntent(R.id.boa_widget_weather, openWeather)
      appWidgetManager.updateAppWidget(id, views)
    }
  }

  private fun deepLink(context: Context, uri: String, requestCode: Int): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.data = Uri.parse(uri)
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(
      context,
      requestCode,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  // The record PNG, scaled down: widget bitmaps travel over IPC, so they
  // are kept small.
  private fun loadArt(path: String?): Bitmap? {
    if (path.isNullOrBlank()) return null
    return try {
      val file = File(Uri.parse(path).path ?: path)
      if (!file.exists()) return null
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(file.absolutePath, bounds)
      var sample = 1
      while (bounds.outWidth / (sample * 2) >= ART_PX) sample *= 2
      BitmapFactory.decodeFile(file.absolutePath, BitmapFactory.Options().apply { inSampleSize = sample })
    } catch (e: Exception) {
      null
    }
  }

  private fun iconFor(name: String?): Int =
    when (name) {
      "sun" -> R.drawable.boa_wx_sun
      "moon" -> R.drawable.boa_wx_moon
      "partly" -> R.drawable.boa_wx_partly
      "cloud_night" -> R.drawable.boa_wx_cloud_night
      "rain" -> R.drawable.boa_wx_rain
      "storm" -> R.drawable.boa_wx_storm
      "snow" -> R.drawable.boa_wx_snow
      else -> R.drawable.boa_wx_cloud
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
    private const val ART_PX = 160
  }
}
