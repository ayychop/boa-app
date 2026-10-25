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
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import java.io.File

/**
 * BOA home screen widget, in the style picked in the app (Profile > Home
 * screen widget):
 * - Glass (boa_widget): the clock and date, today's weather and what's
 *   playing, on a pane of frosted glass; swapped (boa_widget_flipped), the
 *   weather on the left and the clock on the right, Samsung style;
 * - Compact (boa_widget_compact): one slim row, the time, what's playing
 *   and the temperature;
 * - Record (boa_widget_record): the minimal radio wheel, the station's
 *   record large with its name and the song. The app saves everything it
 * shows to shared preferences (the BoaWidget native module) and asks for a
 * redraw; this reads them each time it draws:
 * - the glass's tint and opacity;
 * - the station and song, and the station's record artwork (a PNG the app
 *   renders, with the station's logo as the label). With nothing playing it
 *   shows the BOA Network logo instead;
 * - the weather (icon, temperature, place, rain outlook).
 * The clock is a TextClock, kept current by the launcher. Tapping the
 * weather opens the forecast (network.boa://weather); anywhere else opens
 * what's playing (network.boa://now-playing: the Radio tab). The links are
 * ACTION_VIEW intents: React Native only passes a link on to the app from
 * a view intent, so a launch intent carrying one would go nowhere.
 *
 * Each layout has only some of the views, and a widget that sets a view its
 * layout doesn't have is refused by the launcher, so everything is set
 * through `on`, which skips views the chosen layout lacks.
 *
 * Nothing it reads is required: before the app has ever run, or if the
 * weather or location never loaded, every value falls back to a default
 * and the widget still draws (the clock, "Tap for weather", "Tap to tune
 * in"). A failure drawing one widget falls back to the plain layout rather
 * than leaving the launcher with nothing to show.
 */
class BoaWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (id in appWidgetIds) {
      val views = try {
        draw(context)
      } catch (e: Exception) {
        Log.w(TAG, "Widget draw failed, showing the plain layout", e)
        RemoteViews(context.packageName, styleOf(context).layout)
      }
      try {
        appWidgetManager.updateAppWidget(id, views)
      } catch (e: Exception) {
        Log.w(TAG, "Widget update failed", e)
      }
    }
  }

  // Resizing the widget redraws it at its new size.
  override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
    onUpdate(context, appWidgetManager, intArrayOf(appWidgetId))
  }

  // The chosen style; Glass swapped (weather left, clock right) when the
  // app's "Swap sides" is on.
  private fun styleOf(context: Context): Style {
    val prefs = context.getSharedPreferences("boa_widget", Context.MODE_PRIVATE)
    val name = runCatching { prefs.getString("layout", null) }.getOrNull()
    val flipped = runCatching { prefs.getBoolean("flipped", false) }.getOrDefault(false)
    val style = STYLES[name] ?: STYLES.getValue("glass")
    return if (flipped && style === STYLES["glass"]) STYLES.getValue("glass_flipped") else style
  }

  private fun draw(context: Context): RemoteViews {
    val style = styleOf(context)
    val prefs = context.getSharedPreferences("boa_widget", Context.MODE_PRIVATE)
    // Read defensively: a missing or mistyped value is just a default.
    fun str(key: String) = runCatching { prefs.getString(key, null) }.getOrNull()?.takeIf { it.isNotBlank() }
    val tint = parseColor(str("color"), DEFAULT_TINT)
    val opacity = runCatching { prefs.getFloat("opacity", DEFAULT_OPACITY) }.getOrDefault(DEFAULT_OPACITY).coerceIn(0f, 1f)
    val title = str("title")
    val subtitle = str("subtitle")
    val playing = runCatching { prefs.getBoolean("playing", false) }.getOrDefault(false)
    val art = if (title != null) loadArt(str("artwork"), style.artPx) else null

    val wxTemp = str("wx_temp")
    val wxIcon = str("wx_icon")
    val wxPlace = str("wx_place")
    val wxDetail = str("wx_detail")

    // Light glass that's mostly opaque gets dark text; anything else, light.
    val dark = luminance(tint) > 0.6 && opacity > 0.5f
    val primary = if (dark) Color.parseColor("#141416") else Color.parseColor("#F3EFE8")
    val secondary = if (dark) Color.parseColor("#B3141416") else Color.parseColor("#B3F3EFE8")
    val accent = if (dark) Color.parseColor("#9A6A22") else Color.parseColor("#E2A84B")
    val rule = if (dark) Color.parseColor("#1F141416") else Color.parseColor("#1FF3EFE8")

    val openPlaying = deepLink(context, "network.boa://now-playing", 0)
    val openWeather = deepLink(context, "network.boa://weather", 1)

    val views = RemoteViews(context.packageName, style.layout)
    // Sets a view only if this style's layout has it.
    fun on(id: Int, set: () -> Unit) {
      if (id in style.ids) set()
    }
    on(R.id.boa_widget_glass) { views.setInt(R.id.boa_widget_glass, "setColorFilter", tint or OPAQUE) }
    on(R.id.boa_widget_glass) { views.setInt(R.id.boa_widget_glass, "setImageAlpha", (opacity * 255).toInt()) }
    on(R.id.boa_widget_time) { views.setTextColor(R.id.boa_widget_time, primary) }
    on(R.id.boa_widget_date) { views.setTextColor(R.id.boa_widget_date, secondary) }
    on(R.id.boa_widget_wx_temp) { views.setTextColor(R.id.boa_widget_wx_temp, primary) }
    on(R.id.boa_widget_wx_place) { views.setTextColor(R.id.boa_widget_wx_place, primary) }
    on(R.id.boa_widget_wx_detail) { views.setTextColor(R.id.boa_widget_wx_detail, secondary) }
    on(R.id.boa_widget_title) { views.setTextColor(R.id.boa_widget_title, accent) }
    on(R.id.boa_widget_subtitle) { views.setTextColor(R.id.boa_widget_subtitle, secondary) }
    on(R.id.boa_widget_rule) { views.setInt(R.id.boa_widget_rule, "setBackgroundColor", rule) }

    // Weather: the icon tinted to the text, or a prompt until there is any.
    if (wxTemp != null) {
      on(R.id.boa_widget_wx_temp) { views.setTextViewText(R.id.boa_widget_wx_temp, wxTemp) }
      on(R.id.boa_widget_wx_icon) { views.setImageViewResource(R.id.boa_widget_wx_icon, iconFor(wxIcon)) }
      on(R.id.boa_widget_wx_icon) { views.setInt(R.id.boa_widget_wx_icon, "setColorFilter", if (wxIcon == "sun") accent else primary) }
      on(R.id.boa_widget_wx_icon) { views.setViewVisibility(R.id.boa_widget_wx_icon, View.VISIBLE) }
      on(R.id.boa_widget_wx_place) { views.setTextViewText(R.id.boa_widget_wx_place, wxPlace ?: "") }
    } else {
      on(R.id.boa_widget_wx_temp) { views.setTextViewText(R.id.boa_widget_wx_temp, context.getString(R.string.boa_widget_wx_blank)) }
      on(R.id.boa_widget_wx_icon) { views.setViewVisibility(R.id.boa_widget_wx_icon, View.GONE) }
      on(R.id.boa_widget_wx_place) { views.setTextViewText(R.id.boa_widget_wx_place, context.getString(R.string.boa_widget_wx_setup)) }
    }
    if (wxTemp != null && !wxDetail.isNullOrBlank()) {
      on(R.id.boa_widget_wx_detail) { views.setTextViewText(R.id.boa_widget_wx_detail, wxDetail) }
      on(R.id.boa_widget_wx_detail) { views.setViewVisibility(R.id.boa_widget_wx_detail, View.VISIBLE) }
    } else {
      on(R.id.boa_widget_wx_detail) { views.setViewVisibility(R.id.boa_widget_wx_detail, View.GONE) }
    }

    // What's playing: the station's record, else the BOA logo.
    if (art != null) {
      on(R.id.boa_widget_art) { views.setImageViewBitmap(R.id.boa_widget_art, art) }
      on(R.id.boa_widget_art) { views.setViewVisibility(R.id.boa_widget_art, View.VISIBLE) }
      on(R.id.boa_widget_logo) { views.setViewVisibility(R.id.boa_widget_logo, View.GONE) }
    } else {
      on(R.id.boa_widget_art) { views.setViewVisibility(R.id.boa_widget_art, View.GONE) }
      on(R.id.boa_widget_logo) { views.setViewVisibility(R.id.boa_widget_logo, View.VISIBLE) }
    }
    val cta = if (style.layout == R.layout.boa_widget_record) R.string.boa_widget_cta_short else R.string.boa_widget_cta
    on(R.id.boa_widget_title) { views.setTextViewText(R.id.boa_widget_title, title?.uppercase() ?: context.getString(cta)) }
    if (subtitle.isNullOrBlank()) {
      on(R.id.boa_widget_subtitle) { views.setViewVisibility(R.id.boa_widget_subtitle, View.GONE) }
    } else {
      on(R.id.boa_widget_subtitle) { views.setTextViewText(R.id.boa_widget_subtitle, subtitle) }
      on(R.id.boa_widget_subtitle) { views.setViewVisibility(R.id.boa_widget_subtitle, View.VISIBLE) }
    }
    on(R.id.boa_widget_live) { views.setViewVisibility(R.id.boa_widget_live, if (playing && title != null) View.VISIBLE else View.GONE) }

    if (openPlaying != null) on(R.id.boa_widget_root) { views.setOnClickPendingIntent(R.id.boa_widget_root, openPlaying) }
    if (openPlaying != null) on(R.id.boa_widget_media) { views.setOnClickPendingIntent(R.id.boa_widget_media, openPlaying) }
    if (openWeather != null) on(R.id.boa_widget_weather) { views.setOnClickPendingIntent(R.id.boa_widget_weather, openWeather) }
    return views
  }

  // A view intent for the app's own scheme, kept to this app. The main
  // activity (singleTask, with the network.boa intent filter) gets it as a
  // new intent when already running, which React Native hands to Linking.
  private fun deepLink(context: Context, uri: String, requestCode: Int): PendingIntent? {
    val launch = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    if (launch.resolveActivity(context.packageManager) == null) return null
    return PendingIntent.getActivity(
      context,
      requestCode,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  // The record PNG, scaled down: widget bitmaps travel over IPC, so they
  // are kept small.
  private fun loadArt(path: String?, px: Int): Bitmap? {
    if (path.isNullOrBlank()) return null
    return try {
      val file = File(Uri.parse(path).path ?: path)
      if (!file.exists()) return null
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(file.absolutePath, bounds)
      var sample = 1
      while (bounds.outWidth / (sample * 2) >= px) sample *= 2
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

  /** A widget style: its layout, the views that layout has, its art size. */
  private class Style(val layout: Int, val ids: Set<Int>, val artPx: Int)

  companion object {
    private const val TAG = "BoaWidget"

    private val MEDIA = setOf(
      R.id.boa_widget_root, R.id.boa_widget_glass, R.id.boa_widget_media, R.id.boa_widget_art,
      R.id.boa_widget_logo, R.id.boa_widget_title, R.id.boa_widget_subtitle, R.id.boa_widget_live,
    )
    private val STYLES = mapOf(
      "glass" to Style(
        R.layout.boa_widget,
        MEDIA + setOf(
          R.id.boa_widget_time, R.id.boa_widget_date, R.id.boa_widget_rule, R.id.boa_widget_weather,
          R.id.boa_widget_wx_icon, R.id.boa_widget_wx_temp, R.id.boa_widget_wx_place, R.id.boa_widget_wx_detail,
        ),
        240,
      ),
      "glass_flipped" to Style(
        R.layout.boa_widget_flipped,
        MEDIA + setOf(
          R.id.boa_widget_time, R.id.boa_widget_date, R.id.boa_widget_rule, R.id.boa_widget_weather,
          R.id.boa_widget_wx_icon, R.id.boa_widget_wx_temp, R.id.boa_widget_wx_place, R.id.boa_widget_wx_detail,
        ),
        240,
      ),
      "compact" to Style(
        R.layout.boa_widget_compact,
        MEDIA + setOf(R.id.boa_widget_time, R.id.boa_widget_rule, R.id.boa_widget_weather, R.id.boa_widget_wx_icon, R.id.boa_widget_wx_temp),
        128,
      ),
      "record" to Style(R.layout.boa_widget_record, MEDIA, 360),
    )
    private val DEFAULT_TINT = Color.parseColor("#141416")
    private const val DEFAULT_OPACITY = 0.55f
    private const val OPAQUE = 0xFF000000.toInt()
  }
}
