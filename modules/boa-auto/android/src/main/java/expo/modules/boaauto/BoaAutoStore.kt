package expo.modules.boaauto

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.facebook.react.ReactApplication
import org.json.JSONObject

/** One station in the car's browser. */
data class AutoStation(val id: String, val name: String, val subtitle: String?, val logo: String?)

/** A genre folder: its stations, in the order the app shows them. */
data class AutoFolder(val id: String, val title: String, val stations: List<AutoStation>)

/** What's on, as the app's audio engine last reported it. */
data class AutoPlayback(
  val status: String = "idle",
  val mediaId: String? = null,
  val title: String? = null,
  val artist: String? = null,
  val artwork: String? = null,
  val canStep: Boolean = false,
)

/**
 * Shared state between the car (BoaAutoService), the art provider and JS
 * (BoaAutoModule). The station catalogue is saved, so the car can browse
 * before the app has started this time; playback is kept in memory, except
 * the last station, which "play" on a fresh start resumes.
 */
object BoaAutoStore {
  private const val PREFS = "boa_auto"
  private const val KEY_CATALOGUE = "catalogue"
  private const val KEY_LAST_MEDIA_ID = "last_media_id"

  @Volatile private var folders: List<AutoFolder>? = null
  @Volatile var playback = AutoPlayback()
    private set

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun folders(context: Context): List<AutoFolder> {
    folders?.let { return it }
    val saved = prefs(context).getString(KEY_CATALOGUE, null) ?: return emptyList()
    return parse(saved).also { folders = it }
  }

  fun setCatalogue(context: Context, json: String) {
    folders = parse(json)
    prefs(context).edit().putString(KEY_CATALOGUE, json).apply()
  }

  fun station(context: Context, id: String): AutoStation? =
    folders(context).asSequence().flatMap { it.stations.asSequence() }.firstOrNull { it.id == id }

  fun setPlayback(context: Context, next: AutoPlayback) {
    playback = next
    next.mediaId?.let { prefs(context).edit().putString(KEY_LAST_MEDIA_ID, it).apply() }
  }

  fun lastMediaId(context: Context): String? = playback.mediaId ?: prefs(context).getString(KEY_LAST_MEDIA_ID, null)

  private fun parse(json: String): List<AutoFolder> =
    try {
      val list = JSONObject(json).getJSONArray("folders")
      (0 until list.length()).map { i ->
        val folder = list.getJSONObject(i)
        val stations = folder.getJSONArray("stations")
        AutoFolder(
          id = folder.getString("id"),
          title = folder.getString("title"),
          stations = (0 until stations.length()).map { j ->
            val s = stations.getJSONObject(j)
            AutoStation(
              id = s.getString("id"),
              name = s.getString("name"),
              subtitle = s.optString("subtitle").ifEmpty { null },
              logo = s.optString("logo").ifEmpty { null },
            )
          },
        )
      }
    } catch (e: Exception) {
      emptyList()
    }
}

/**
 * Commands from the car to JS ("play", "resume", "pause", "next",
 * "previous", "catalogue"). The app's audio engine lives in JS, so if JS
 * isn't running yet (the car connected with the app closed) the command
 * waits here and the React host is started; JS picks it up as soon as it
 * starts listening.
 */
object BoaAutoBridge {
  // Older than this when JS arrives, a command is dropped: the driver has
  // moved on.
  private const val STALE_MS = 30_000L

  private val main = Handler(Looper.getMainLooper())
  private val pending = mutableListOf<Pair<Long, Bundle>>()
  private var listener: ((Bundle) -> Unit)? = null

  fun dispatch(context: Context, action: String, mediaId: String? = null) {
    val command = Bundle().apply {
      putString("action", action)
      putString("mediaId", mediaId)
    }
    main.post {
      listener?.let { return@post it(command) }
      // One catalogue request is enough.
      if (action == "catalogue" && pending.any { it.second.getString("action") == "catalogue" }) return@post
      pending.add(SystemClock.elapsedRealtime() to command)
      wakeJs(context)
    }
  }

  fun attach(fn: (Bundle) -> Unit) {
    main.post {
      listener = fn
      val now = SystemClock.elapsedRealtime()
      val ready = pending.filter { now - it.first < STALE_MS }.map { it.second }
      pending.clear()
      ready.forEach(fn)
    }
  }

  fun detach() {
    main.post { listener = null }
  }

  private fun wakeJs(context: Context) {
    try {
      (context.applicationContext as? ReactApplication)?.reactHost?.start()
    } catch (e: Exception) {
      // The car shows the station as paused; the app picks up from here
      // when it's opened.
    }
  }
}
