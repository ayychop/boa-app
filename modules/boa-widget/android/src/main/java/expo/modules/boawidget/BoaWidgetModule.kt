package expo.modules.boawidget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The bridge from the app to its home screen widget. The widget's provider
 * (BoaWidgetProvider, added to the app by plugins/withBoaWidget.js) reads
 * these preferences each time it draws; after saving them this asks every
 * placed widget to redraw.
 */
class BoaWidgetModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "No React context" }

  override fun definition() = ModuleDefinition {
    Name("BoaWidget")

    // Background tint as #RRGGBB and its opacity, 0 (clear glass) to 1.
    AsyncFunction("setStyle") { color: String, opacity: Double ->
      prefs().edit()
        .putString(KEY_COLOR, color)
        .putFloat(KEY_OPACITY, opacity.coerceIn(0.0, 1.0).toFloat())
        .apply()
      refresh()
    }

    // What's on, under the clock: the station, then the song if known; the
    // station's record artwork (a file:// PNG, or null for the BOA logo);
    // and whether it's on air (the green dot).
    AsyncFunction("setNowPlaying") { title: String?, subtitle: String?, artwork: String?, playing: Boolean ->
      prefs().edit()
        .putString(KEY_TITLE, title)
        .putString(KEY_SUBTITLE, subtitle)
        .putString(KEY_ARTWORK, artwork)
        .putBoolean(KEY_PLAYING, playing)
        .apply()
      refresh()
    }

    // Today's weather: "14°", an icon name (sun, moon, partly, cloud,
    // cloud_night, rain, storm, snow), the place and the rain outlook.
    // A null temperature clears it.
    AsyncFunction("setWeather") { temp: String?, icon: String?, place: String?, detail: String? ->
      prefs().edit()
        .putString(KEY_WX_TEMP, temp)
        .putString(KEY_WX_ICON, icon)
        .putString(KEY_WX_PLACE, place)
        .putString(KEY_WX_DETAIL, detail)
        .apply()
      refresh()
    }

    // How many widgets are on the home screen (for the settings screen).
    AsyncFunction("count") {
      AppWidgetManager.getInstance(context).getAppWidgetIds(provider()).size
    }
  }

  private fun prefs() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun provider() = ComponentName(context.packageName, "${context.packageName}.BoaWidgetProvider")

  private fun refresh() {
    val ids = AppWidgetManager.getInstance(context).getAppWidgetIds(provider())
    if (ids.isEmpty()) return
    val intent = Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).apply {
      component = provider()
      putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
    }
    context.sendBroadcast(intent)
  }

  companion object {
    const val PREFS = "boa_widget"
    const val KEY_COLOR = "color"
    const val KEY_OPACITY = "opacity"
    const val KEY_TITLE = "title"
    const val KEY_SUBTITLE = "subtitle"
    const val KEY_ARTWORK = "artwork"
    const val KEY_PLAYING = "playing"
    const val KEY_WX_TEMP = "wx_temp"
    const val KEY_WX_ICON = "wx_icon"
    const val KEY_WX_PLACE = "wx_place"
    const val KEY_WX_DETAIL = "wx_detail"
  }
}
