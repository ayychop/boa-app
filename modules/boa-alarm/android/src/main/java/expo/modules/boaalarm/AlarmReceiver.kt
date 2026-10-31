package expo.modules.boaalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** The system alarm going off: start the radio, and set the next ring. */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(AlarmScheduler.EXTRA_ID) ?: return
    val snoozed = intent.getBooleanExtra(AlarmScheduler.EXTRA_SNOOZE, false)
    val found: AlarmStore.Alarm? =
      if (snoozed) {
        AlarmStore.Alarm(
          id = id,
          name = intent.getStringExtra(AlarmScheduler.EXTRA_NAME) ?: "BOA Alarm",
          hour = 0,
          minute = 0,
          days = emptyList(),
          station = intent.getStringExtra(AlarmScheduler.EXTRA_STATION) ?: "",
          url = intent.getStringExtra(AlarmScheduler.EXTRA_URL) ?: "",
        )
      } else {
        AlarmStore.find(context, id)
      }
    val alarm = found ?: return
    if (alarm.url.isEmpty()) return

    if (!snoozed) {
      // Once-only: remember it rang (the app turns it off when it opens).
      // Repeating: set the next one now, before anything can go wrong.
      if (alarm.days.isEmpty()) AlarmStore.markFired(context, id) else AlarmScheduler.schedule(context, alarm)
    }
    AlarmService.start(context, alarm)
  }
}

/** After a restart, an app update, or the clock or time zone changing: set every alarm again. */
class AlarmBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      AlarmScheduler.rescheduleAll(context)
    } catch (_: Exception) {
    }
  }
}
