package expo.modules.boaalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray

/**
 * Radio alarms that ring with the app closed. JavaScript hands over the list
 * (`sync`); from then on the phone itself rings them (AlarmScheduler,
 * AlarmReceiver, AlarmService) with no JavaScript running. The app learns
 * what happened through `onAlarmState`, and `takeFired` tells it which
 * once-only alarms rang while it was closed.
 */
class BoaAlarmModule : Module() {
  private var receiver: BroadcastReceiver? = null

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "No React context" }

  override fun definition() = ModuleDefinition {
    Name("BoaAlarm")
    Events("onAlarmState")

    OnCreate {
      val r = object : BroadcastReceiver() {
        override fun onReceive(c: Context, intent: Intent) {
          sendEvent(
            "onAlarmState",
            mapOf(
              "state" to (intent.getStringExtra(AlarmService.EXTRA_STATE) ?: ""),
              "id" to (intent.getStringExtra(AlarmScheduler.EXTRA_ID) ?: ""),
              "name" to (intent.getStringExtra(AlarmScheduler.EXTRA_NAME) ?: ""),
              "station" to (intent.getStringExtra(AlarmScheduler.EXTRA_STATION) ?: ""),
            ),
          )
        }
      }
      receiver = r
      ContextCompat.registerReceiver(context, r, IntentFilter(AlarmService.ACTION_STATE), ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    OnDestroy {
      receiver?.let {
        try {
          context.unregisterReceiver(it)
        } catch (_: Exception) {
        }
      }
      receiver = null
    }

    /** Whether Android lets BOA set alarms at an exact minute. */
    Function("canScheduleExact") { AlarmScheduler.canScheduleExact(context) }

    /** The station alarms (a JSON array), replacing the last list. */
    Function("sync") { json: String ->
      val arr = JSONArray(json)
      val list = (0 until arr.length()).mapNotNull { i ->
        val o = arr.optJSONObject(i) ?: return@mapNotNull null
        val d = o.optJSONArray("days")
        AlarmStore.Alarm(
          id = o.optString("id"),
          name = o.optString("name", "BOA Alarm"),
          hour = o.optInt("hour"),
          minute = o.optInt("minute"),
          days = if (d == null) emptyList() else (0 until d.length()).map { d.optInt(it) },
          station = o.optString("station"),
          url = o.optString("url"),
        ).takeIf { it.id.isNotEmpty() && it.url.isNotEmpty() }
      }
      AlarmStore.save(context, list)
      AlarmScheduler.rescheduleAll(context)
      list.size
    }

    /** Which look the alarm page wears: one of AlarmTheme's ids. */
    Function("setTheme") { id: String -> AlarmStore.setTheme(context, id) }

    /** Shows the alarm page as it will look, over whatever is on screen (never while an alarm really rings). */
    Function("preview") { id: String ->
      if (AlarmService.current != null) {
        false
      } else {
        try {
          context.startActivity(
            Intent(context, AlarmActivity::class.java)
              .putExtra(AlarmActivity.EXTRA_PREVIEW, true)
              .putExtra(AlarmActivity.EXTRA_THEME, AlarmTheme.byId(id).id)
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
          )
          true
        } catch (_: Exception) {
          false
        }
      }
    }

    /** Ids of once-only alarms that rang while the app was closed. */
    Function("takeFired") { AlarmStore.takeFired(context) }

    /** The alarm ringing now (id, name, station), or null. */
    Function("current") {
      AlarmService.current?.let { mapOf("id" to it.id, "name" to it.name, "station" to it.station) }
    }

    Function("stop") { AlarmService.command(context, AlarmService.ACTION_STOP) }
    Function("snooze") { AlarmService.command(context, AlarmService.ACTION_SNOOZE) }

    /** The system's battery screen for BOA: "Unrestricted" keeps the phone from stopping the app. */
    Function("openBatterySettings") {
      val i = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(i)
        true
      } catch (_: Exception) {
        false
      }
    }
  }
}
