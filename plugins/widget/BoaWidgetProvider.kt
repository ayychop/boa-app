package __PACKAGE__

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/**
 * BOA Radio home screen widget: the BOA record beside a live clock and the
 * date. The clock is a TextClock, which the launcher keeps current itself,
 * so this only draws the layout and wires the tap that opens the app.
 */
class BoaWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    }
    val tap = launch?.let {
      PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    for (id in appWidgetIds) {
      val views = RemoteViews(context.packageName, R.layout.boa_widget)
      if (tap != null) views.setOnClickPendingIntent(R.id.boa_widget_root, tap)
      appWidgetManager.updateAppWidget(id, views)
    }
  }
}
