package expo.modules.boaauto

import android.app.PendingIntent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.support.v4.media.MediaBrowserCompat.MediaItem
import android.support.v4.media.MediaDescriptionCompat
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.media.MediaBrowserServiceCompat

/**
 * BOA Radio on the car screen (Android Auto). Lists the stations by genre,
 * with their logos, and turns the car's controls into commands for the
 * app's own audio engine (see BoaAutoBridge and src/audio/car.js), so the
 * phone plays exactly as if the station had been tapped in the app. This
 * session only mirrors that playback; the sound itself is expo-audio's.
 */
class BoaAutoService : MediaBrowserServiceCompat() {
  private lateinit var session: MediaSessionCompat
  private val main = Handler(Looper.getMainLooper())
  // Browse requests that arrived before JS had sent the stations.
  private val waiting = mutableListOf<Pair<String, Result<MutableList<MediaItem>>>>()

  override fun onCreate() {
    super.onCreate()
    session = MediaSessionCompat(this, "BoaAuto").apply {
      setCallback(callback)
      packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
        launch.data = Uri.parse(NOW_PLAYING_URI)
        setSessionActivity(
          PendingIntent.getActivity(this@BoaAutoService, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        )
      }
      isActive = true
    }
    sessionToken = session.sessionToken
    current = this
    refresh()
  }

  override fun onDestroy() {
    if (current === this) current = null
    main.removeCallbacksAndMessages(null)
    session.isActive = false
    session.release()
    super.onDestroy()
  }

  override fun onGetRoot(clientPackageName: String, clientUid: Int, rootHints: Bundle?): BrowserRoot {
    rootTabLimit = rootHints?.getInt(KEY_ROOT_CHILDREN_LIMIT, 4)?.takeIf { it > 0 } ?: 4
    val extras = Bundle().apply {
      putBoolean(CONTENT_STYLE_SUPPORTED, true)
      putInt(CONTENT_STYLE_BROWSABLE_HINT, CONTENT_STYLE_LIST)
      putInt(CONTENT_STYLE_PLAYABLE_HINT, CONTENT_STYLE_GRID)
      putBoolean(SEARCH_SUPPORTED, true)
    }
    return BrowserRoot(ROOT, extras)
  }

  override fun onLoadChildren(parentId: String, result: Result<MutableList<MediaItem>>) {
    val folders = BoaAutoStore.folders(this)
    if (folders.isEmpty()) {
      // First time in the car before the app has run: ask JS for the
      // stations and answer when they arrive (or with nothing after a wait).
      result.detach()
      waiting.add(parentId to result)
      BoaAutoBridge.dispatch(this, "catalogue")
      main.postDelayed({ answerWaiting() }, CATALOGUE_WAIT_MS)
      return
    }
    result.sendResult(children(parentId, folders))
  }

  override fun onSearch(query: String, extras: Bundle?, result: Result<MutableList<MediaItem>>) {
    result.sendResult(search(query).map(::stationItem).toMutableList())
  }

  /** The stations arrived from JS: refresh the car's lists. */
  fun onCatalogue() {
    answerWaiting()
    notifyChildrenChanged(ROOT)
    BoaAutoStore.folders(this).forEach { notifyChildrenChanged(it.id) }
    notifyChildrenChanged(MORE)
  }

  private fun answerWaiting() {
    val folders = BoaAutoStore.folders(this)
    val answering = waiting.toList()
    waiting.clear()
    answering.forEach { (parentId, result) -> result.sendResult(children(parentId, folders)) }
  }

  private fun children(parentId: String, folders: List<AutoFolder>): MutableList<MediaItem> {
    // The car shows the root's folders as tabs, up to a limit; past it the
    // last tab holds the rest.
    val (tabs, more) =
      if (folders.size <= rootTabLimit) folders to emptyList()
      else folders.take(rootTabLimit - 1) to folders.drop(rootTabLimit - 1)
    return when (parentId) {
      ROOT -> (tabs.map(::folderItem) + listOfNotNull(more.takeIf { it.isNotEmpty() }?.let { moreItem() })).toMutableList()
      MORE -> more.map(::folderItem).toMutableList()
      else -> folders.firstOrNull { it.id == parentId }?.stations?.map(::stationItem)?.toMutableList() ?: mutableListOf()
    }
  }

  private fun folderItem(folder: AutoFolder) =
    MediaItem(
      MediaDescriptionCompat.Builder().setMediaId(folder.id).setTitle(folder.title).build(),
      MediaItem.FLAG_BROWSABLE
    )

  private fun moreItem() =
    MediaItem(MediaDescriptionCompat.Builder().setMediaId(MORE).setTitle("More genres").build(), MediaItem.FLAG_BROWSABLE)

  private fun stationItem(station: AutoStation) =
    MediaItem(
      MediaDescriptionCompat.Builder()
        .setMediaId(station.id)
        .setTitle(station.name)
        .setSubtitle(station.subtitle ?: "BOA Radio")
        .setIconUri(station.logo?.let { BoaAutoArtProvider.stationUri(this, station.id) })
        .build(),
      MediaItem.FLAG_PLAYABLE
    )

  private fun search(query: String): List<AutoStation> {
    val q = query.trim().lowercase()
    val folders = BoaAutoStore.folders(this)
    if (q.isEmpty()) return emptyList()
    val byName = folders.flatMap { it.stations }.filter { it.name.lowercase().contains(q) }
    val byGenre = folders.filter { it.title.lowercase().contains(q) || q.contains(it.title.lowercase()) }.flatMap { it.stations }
    return (byName + byGenre).distinctBy { it.id }
  }

  /** Mirrors the app's playback on the car screen. */
  fun refresh() {
    val p = BoaAutoStore.playback
    val state = when (p.status) {
      "playing" -> PlaybackStateCompat.STATE_PLAYING
      "loading" -> PlaybackStateCompat.STATE_BUFFERING
      "error" -> PlaybackStateCompat.STATE_ERROR
      "idle" -> PlaybackStateCompat.STATE_NONE
      else -> PlaybackStateCompat.STATE_PAUSED
    }
    var actions = PlaybackStateCompat.ACTION_PLAY or
      PlaybackStateCompat.ACTION_PAUSE or
      PlaybackStateCompat.ACTION_PLAY_PAUSE or
      PlaybackStateCompat.ACTION_STOP or
      PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID or
      PlaybackStateCompat.ACTION_PLAY_FROM_SEARCH
    if (p.canStep) actions = actions or PlaybackStateCompat.ACTION_SKIP_TO_NEXT or PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
    session.setPlaybackState(
      PlaybackStateCompat.Builder()
        .setActions(actions)
        .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1f)
        .apply { if (state == PlaybackStateCompat.STATE_ERROR) setErrorMessage(PlaybackStateCompat.ERROR_CODE_APP_ERROR, "Couldn't reach this station") }
        .build()
    )
    if (p.mediaId == null) return session.setMetadata(null)
    session.setMetadata(
      MediaMetadataCompat.Builder()
        .putString(MediaMetadataCompat.METADATA_KEY_MEDIA_ID, p.mediaId)
        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, p.title)
        .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_TITLE, p.title)
        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, p.artist)
        .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_SUBTITLE, p.artist)
        .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "BOA Networks")
        .apply {
          p.artwork?.let {
            val uri = BoaAutoArtProvider.nowPlayingUri(this@BoaAutoService, it).toString()
            putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ART_URI, uri)
            putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON_URI, uri)
          }
        }
        .build()
    )
  }

  private val callback = object : MediaSessionCompat.Callback() {
    override fun onPlayFromMediaId(mediaId: String?, extras: Bundle?) {
      if (mediaId != null) BoaAutoBridge.dispatch(this@BoaAutoService, "play", mediaId)
    }

    // "Play" with nothing chosen: carry on with the last station.
    override fun onPlay() = BoaAutoBridge.dispatch(this@BoaAutoService, "resume", BoaAutoStore.lastMediaId(this@BoaAutoService))

    override fun onPause() = BoaAutoBridge.dispatch(this@BoaAutoService, "pause")

    override fun onStop() = BoaAutoBridge.dispatch(this@BoaAutoService, "pause")

    override fun onSkipToNext() = BoaAutoBridge.dispatch(this@BoaAutoService, "next")

    override fun onSkipToPrevious() = BoaAutoBridge.dispatch(this@BoaAutoService, "previous")

    // "Hey Google, play Afrobeats on BOA HUB": a station by name, else the
    // genre's first station, else carry on.
    override fun onPlayFromSearch(query: String?, extras: Bundle?) {
      val match = search(query.orEmpty()).firstOrNull()
      if (match != null) BoaAutoBridge.dispatch(this@BoaAutoService, "play", match.id)
      else onPlay()
    }
  }

  companion object {
    private const val ROOT = "boa:root"
    private const val MORE = "boa:more"
    private const val NOW_PLAYING_URI = "boa://now-playing"
    private const val CATALOGUE_WAIT_MS = 10_000L

    // Android Auto's browse hints (androidx.media's MediaConstants).
    private const val KEY_ROOT_CHILDREN_LIMIT = "androidx.media.MediaBrowserCompat.Extras.KEY_ROOT_CHILDREN_LIMIT"
    private const val CONTENT_STYLE_SUPPORTED = "android.media.browse.CONTENT_STYLE_SUPPORTED"
    private const val CONTENT_STYLE_BROWSABLE_HINT = "android.media.browse.CONTENT_STYLE_BROWSABLE_HINT"
    private const val CONTENT_STYLE_PLAYABLE_HINT = "android.media.browse.CONTENT_STYLE_PLAYABLE_HINT"
    private const val SEARCH_SUPPORTED = "android.media.browse.SEARCH_SUPPORTED"
    private const val CONTENT_STYLE_LIST = 1
    private const val CONTENT_STYLE_GRID = 2

    private var rootTabLimit = 4

    /** The running service, while a car (or another media browser) is connected. */
    @Volatile var current: BoaAutoService? = null
      private set
  }
}
