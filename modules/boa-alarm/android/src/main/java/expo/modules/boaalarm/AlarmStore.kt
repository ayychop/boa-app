package expo.modules.boaalarm

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * The radio alarms, kept on the phone itself (not just in the app's JS) so
 * they can be set again after a restart with the app closed, and so a ring
 * can find its station without any JavaScript running.
 */
object AlarmStore {
  private const val PREFS = "boa_alarm_store"

  /** days: 0 = Sunday ... 6 = Saturday, as in the app. Empty means once. */
  data class Alarm(
    val id: String,
    val name: String,
    val hour: Int,
    val minute: Int,
    val days: List<Int>,
    val station: String,
    val url: String,
  )

  private fun prefs(c: Context) = c.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  @Synchronized
  fun save(c: Context, alarms: List<Alarm>) {
    val arr = JSONArray()
    alarms.forEach {
      arr.put(
        JSONObject()
          .put("id", it.id).put("name", it.name).put("hour", it.hour).put("minute", it.minute)
          .put("days", JSONArray(it.days)).put("station", it.station).put("url", it.url),
      )
    }
    prefs(c).edit().putString("alarms", arr.toString()).apply()
  }

  @Synchronized
  fun load(c: Context): List<Alarm> {
    val raw = prefs(c).getString("alarms", null) ?: return emptyList()
    return try {
      val arr = JSONArray(raw)
      (0 until arr.length()).mapNotNull { i ->
        val o = arr.optJSONObject(i) ?: return@mapNotNull null
        val d = o.optJSONArray("days")
        Alarm(
          id = o.optString("id"),
          name = o.optString("name", "BOA Alarm"),
          hour = o.optInt("hour"),
          minute = o.optInt("minute"),
          days = if (d == null) emptyList() else (0 until d.length()).map { d.optInt(it) },
          station = o.optString("station"),
          url = o.optString("url"),
        ).takeIf { it.id.isNotEmpty() && it.url.isNotEmpty() }
      }
    } catch (_: Exception) {
      emptyList()
    }
  }

  fun find(c: Context, id: String): Alarm? = load(c).firstOrNull { it.id == id }

  /** Once-only alarms that have rung; the app turns them off when it next opens. */
  @Synchronized
  fun markFired(c: Context, id: String) {
    val set = prefs(c).getStringSet("fired", emptySet())!!.toMutableSet()
    set.add(id)
    prefs(c).edit().putStringSet("fired", set).apply()
  }

  fun firedIds(c: Context): Set<String> = prefs(c).getStringSet("fired", emptySet()) ?: emptySet()

  @Synchronized
  fun takeFired(c: Context): List<String> {
    val set = firedIds(c).toList()
    prefs(c).edit().remove("fired").apply()
    return set
  }

  /** The keys of every system alarm set, so the ones no longer wanted can be cancelled. */
  @Synchronized
  fun scheduledKeys(c: Context): Set<String> = prefs(c).getStringSet("scheduled", emptySet()) ?: emptySet()

  @Synchronized
  fun setScheduledKeys(c: Context, keys: Set<String>) {
    prefs(c).edit().putStringSet("scheduled", keys).apply()
  }
}
