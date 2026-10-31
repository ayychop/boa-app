package expo.modules.boaalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import java.util.Calendar

/**
 * Sets the system alarms. Each is AlarmManager.setAlarmClock: the one kind
 * Android never defers, in Doze or on a battery saver, and it shows the
 * alarm icon in the status bar. It needs the exact-alarm permission (off by
 * default on Android 14+); without it the alarm still goes in, as the
 * nearest thing Android allows, and the app asks for the permission.
 */
object AlarmScheduler {
  const val ACTION_FIRE = "expo.modules.boaalarm.FIRE"
  const val EXTRA_ID = "id"
  const val EXTRA_SNOOZE = "snooze"
  const val EXTRA_NAME = "name"
  const val EXTRA_STATION = "station"
  const val EXTRA_URL = "url"

  fun canScheduleExact(c: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return c.getSystemService(AlarmManager::class.java)?.canScheduleExactAlarms() == true
  }

  /** The next time the alarm rings after `from` (millis), or null if it never will. */
  fun nextRing(a: AlarmStore.Alarm, from: Long): Long? {
    val base = Calendar.getInstance().apply {
      timeInMillis = from
      set(Calendar.HOUR_OF_DAY, a.hour)
      set(Calendar.MINUTE, a.minute)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    for (i in 0..7) {
      val day = (base.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, i) }
      if (day.timeInMillis <= from) continue
      val dow = day.get(Calendar.DAY_OF_WEEK) - 1
      if (a.days.isEmpty() || a.days.contains(dow)) return day.timeInMillis
    }
    return null
  }

  private fun fireIntent(c: Context, key: String): Intent =
    Intent(c, AlarmReceiver::class.java).setAction(ACTION_FIRE).setData(Uri.parse("boaalarm://fire/$key"))

  private fun flags(extra: Int = 0) = PendingIntent.FLAG_IMMUTABLE or extra

  /** What tapping the status-bar alarm icon opens: the app. */
  fun showIntent(c: Context): PendingIntent {
    val launch = c.packageManager.getLaunchIntentForPackage(c.packageName) ?: Intent()
    return PendingIntent.getActivity(c, 0, launch, flags(PendingIntent.FLAG_UPDATE_CURRENT))
  }

  /** One system alarm under `key`; `extras` ride along with it. */
  fun setAt(c: Context, key: String, whenMs: Long, extras: Intent.() -> Unit = {}) {
    val am = c.getSystemService(AlarmManager::class.java) ?: return
    val intent = fireIntent(c, key).apply(extras)
    val pi = PendingIntent.getBroadcast(c, key.hashCode(), intent, flags(PendingIntent.FLAG_UPDATE_CURRENT))
    try {
      if (canScheduleExact(c)) am.setAlarmClock(AlarmManager.AlarmClockInfo(whenMs, showIntent(c)), pi)
      else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, whenMs, pi)
    } catch (_: SecurityException) {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, whenMs, pi)
    }
  }

  fun cancel(c: Context, key: String) {
    val am = c.getSystemService(AlarmManager::class.java) ?: return
    val pi = PendingIntent.getBroadcast(c, key.hashCode(), fireIntent(c, key), flags(PendingIntent.FLAG_NO_CREATE)) ?: return
    am.cancel(pi)
    pi.cancel()
  }

  fun schedule(c: Context, a: AlarmStore.Alarm): Long? {
    val at = nextRing(a, System.currentTimeMillis()) ?: return null
    setAt(c, a.id, at) { putExtra(EXTRA_ID, a.id) }
    return at
  }

  /** Brings the system alarms in line with the store: after a sync, a restart, an update. */
  fun rescheduleAll(c: Context) {
    val wanted = AlarmStore.load(c)
    val fired = AlarmStore.firedIds(c)
    val keys = mutableSetOf<String>()
    wanted.forEach { a ->
      if (a.days.isEmpty() && a.id in fired) return@forEach
      if (schedule(c, a) != null) keys.add(a.id)
    }
    AlarmStore.scheduledKeys(c).filter { it !in keys && !it.startsWith("snooze:") }.forEach { cancel(c, it) }
    AlarmStore.setScheduledKeys(c, keys)
  }

  /** Rings again in `minutes`, carrying the whole alarm (it may have been removed meanwhile). */
  fun snooze(c: Context, a: AlarmStore.Alarm, minutes: Int) {
    val at = System.currentTimeMillis() + minutes * 60_000L
    setAt(c, "snooze:${a.id}", at) {
      putExtra(EXTRA_ID, a.id)
      putExtra(EXTRA_SNOOZE, true)
      putExtra(EXTRA_NAME, a.name)
      putExtra(EXTRA_STATION, a.station)
      putExtra(EXTRA_URL, a.url)
    }
  }
}
