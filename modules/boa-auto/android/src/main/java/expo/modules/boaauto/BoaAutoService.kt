package expo.modules.boaauto

import android.app.PendingIntent
import android.content.Intent
import android.media.AudioManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.support.v4.media.MediaBrowserCompat.MediaItem
import android.support.v4.media.MediaDescriptionCompat
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.view.KeyEvent
import androidx.media.MediaBrowserServiceCompat

/**
 * BOA Radio on the car screen (Android Auto). Two tabs: Spotlight, every
 * genre's leading stations as big art tiles under the genre's name, and
 * Genres, a grid of genre mosaics that each open onto their stations. All
 * art is drawn full and opaque (BoaAutoArt), so no tile or backdrop is left
 * black. It turns the car's controls into commands for the
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
      // No empty slots beside play when there's no next or previous (a
      // station played on its own): the heart and the fire move up into
      // them, right next to play.
      setExtras(Bundle().apply {
        putBoolean(SLOT_RESERVATION_SKIP_TO_PREV, false)
        putBoolean(SLOT_RESERVATION_SKIP_TO_NEXT, false)
      })
      // Local playback on the music stream, so the car's volume and the
      // steering wheel's media buttons are routed to this session.
      setPlaybackToLocal(AudioManager.STREAM_MUSIC)
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
    // Grids everywhere: genres and stations as art tiles, not rows of text.
    val extras = Bundle().apply {
      putBoolean(CONTENT_STYLE_SUPPORTED, true)
      putInt(CONTENT_STYLE_BROWSABLE_HINT, CONTENT_STYLE_GRID)
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
    result.sendResult(search(query).map { stationItem(it) }.toMutableList())
  }

  /** The car theme changed: every tile and the now playing art are drawn again. */
  fun onTheme() {
    onCatalogue()
    refresh()
  }

  /** The stations arrived from JS: refresh the car's lists. */
  fun onCatalogue() {
    answerWaiting()
    notifyChildrenChanged(ROOT)
    notifyChildrenChanged(SPOTLIGHT)
    notifyChildrenChanged(GENRES)
    BoaAutoStore.folders(this).forEach { notifyChildrenChanged(it.id) }
    notifyChildrenChanged(MORE)
  }

  private fun answerWaiting() {
    val folders = BoaAutoStore.folders(this)
    val answering = waiting.toList()
    waiting.clear()
    answering.forEach { (parentId, result) -> result.sendResult(children(parentId, folders)) }
  }

  private fun children(parentId: String, folders: List<AutoFolder>): MutableList<MediaItem> =
    when (parentId) {
      // The car shows the root's children as tabs (at least one, up to its limit).
      ROOT -> listOf(tab(SPOTLIGHT, "Spotlight"), tab(GENRES, "Genres")).take(rootTabLimit).toMutableList()
      SPOTLIGHT -> spotlight(folders)
      // MORE: the old "More genres" tab, for a car that still has it open.
      GENRES, MORE -> folders.map(::folderItem).toMutableList()
      else -> folders.firstOrNull { it.id == parentId }?.stations?.map { stationItem(it) }?.toMutableList() ?: mutableListOf()
    }

  // Each genre's leading stations under its name, like a cinema's rows.
  // A station in two genres shows once, in the first.
  private fun spotlight(folders: List<AutoFolder>): MutableList<MediaItem> {
    val seen = mutableSetOf<String>()
    return folders.flatMap { folder ->
      folder.stations.filter { seen.add(it.id) }.take(SPOTLIGHT_PER_GENRE).map { stationItem(it, group = folder.title) }
    }.toMutableList()
  }

  private fun tab(id: String, title: String) =
    MediaItem(MediaDescriptionCompat.Builder().setMediaId(id).setTitle(title).build(), MediaItem.FLAG_BROWSABLE)

  private fun folderItem(folder: AutoFolder) =
    MediaItem(
      MediaDescriptionCompat.Builder()
        .setMediaId(folder.id)
        .setTitle(folder.title)
        .setSubtitle(if (folder.stations.size == 1) "1 station" else "${folder.stations.size} stations")
        .setIconUri(BoaAutoArtProvider.genreUri(this, folder.id))
        .build(),
      MediaItem.FLAG_BROWSABLE
    )

  // Every station has art: its logo on the BOA stage, or its initials.
  private fun stationItem(station: AutoStation, group: String? = null) =
    MediaItem(
      MediaDescriptionCompat.Builder()
        .setMediaId(station.id)
        .setTitle(station.name)
        .setSubtitle(station.subtitle ?: "BOA Radio")
        .setIconUri(BoaAutoArtProvider.stationUri(this, station.id))
        .apply { if (group != null) setExtras(Bundle().apply { putString(CONTENT_STYLE_GROUP_TITLE, group) }) }
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
    // A station on: next and previous always work (through its genre, src/audio/car.js),
    // so the steering wheel's skip buttons are never dead.
    if (p.canStep || p.mediaId != null) actions = actions or PlaybackStateCompat.ACTION_SKIP_TO_NEXT or PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
    session.setPlaybackState(
      PlaybackStateCompat.Builder()
        .setActions(actions)
        .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1f)
        .apply {
          // The heart and the fire, first among the custom actions so they
          // sit closest to play. Lit gold when on, so a tap shows at once.
          // The heart: filled when the station is a favourite.
          val favourite = p.favourite
          if (favourite != null && p.mediaId != null) {
            addCustomAction(
              PlaybackStateCompat.CustomAction.Builder(
                ACTION_FAVOURITE,
                if (favourite) "Remove from favourites" else "Add to favourites",
                if (favourite) R.drawable.boa_auto_heart_filled else R.drawable.boa_auto_heart
              ).build()
            )
          }
          // The fire: Hype, once a day. Lit once you've fired this station today.
          val hyped = p.hyped
          if (hyped != null && p.mediaId != null) {
            addCustomAction(
              PlaybackStateCompat.CustomAction.Builder(
                ACTION_FIRE,
                if (hyped) "Hyped today" else "Hype this station",
                if (hyped) R.drawable.boa_auto_fire_filled else R.drawable.boa_auto_fire
              ).build()
            )
          }
        }
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
        .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_DESCRIPTION, "Live on BOA Radio")
        .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "BOA Networks")
        .apply {
          // Always art, so the car's blurred backdrop is never plain black:
          // the record or logo, or the station's initials without either.
          val uri = BoaAutoArtProvider.nowPlayingUri(this@BoaAutoService, p.artwork ?: "${p.mediaId}|${p.title}").toString()
          putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ART_URI, uri)
          putString(MediaMetadataCompat.METADATA_KEY_ART_URI, uri)
          putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON_URI, uri)
        }
        .build()
    )
  }

  private val callback = object : MediaSessionCompat.Callback() {
    // The steering wheel and the car's own buttons, handled here rather
    // than by MediaSessionCompat's default, which drops skips the playback
    // state doesn't list and waits out a double-tap on play/pause.
    override fun onMediaButtonEvent(mediaButtonEvent: Intent?): Boolean {
      @Suppress("DEPRECATION")
      val key = mediaButtonEvent?.getParcelableExtra<KeyEvent>(Intent.EXTRA_KEY_EVENT) ?: return super.onMediaButtonEvent(mediaButtonEvent)
      if (key.action != KeyEvent.ACTION_DOWN) return true
      if (key.repeatCount > 0) return true
      when (key.keyCode) {
        KeyEvent.KEYCODE_MEDIA_PLAY -> onPlay()
        KeyEvent.KEYCODE_MEDIA_PAUSE, KeyEvent.KEYCODE_MEDIA_STOP -> onPause()
        KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_HEADSETHOOK -> {
          val playing = BoaAutoStore.playback.status.let { it == "playing" || it == "loading" }
          if (playing) onPause() else onPlay()
        }
        KeyEvent.KEYCODE_MEDIA_NEXT, KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> onSkipToNext()
        KeyEvent.KEYCODE_MEDIA_PREVIOUS, KeyEvent.KEYCODE_MEDIA_REWIND -> onSkipToPrevious()
        else -> return super.onMediaButtonEvent(mediaButtonEvent)
      }
      return true
    }

    override fun onPlayFromMediaId(mediaId: String?, extras: Bundle?) {
      if (mediaId != null) BoaAutoBridge.dispatch(this@BoaAutoService, "play", mediaId)
    }

    // "Play" with nothing chosen: carry on with the last station.
    override fun onPlay() = BoaAutoBridge.dispatch(this@BoaAutoService, "resume", BoaAutoStore.lastMediaId(this@BoaAutoService))

    override fun onPause() = BoaAutoBridge.dispatch(this@BoaAutoService, "pause")

    override fun onStop() = BoaAutoBridge.dispatch(this@BoaAutoService, "pause")

    override fun onSkipToNext() = BoaAutoBridge.dispatch(this@BoaAutoService, "next")

    override fun onSkipToPrevious() = BoaAutoBridge.dispatch(this@BoaAutoService, "previous")

    override fun onCustomAction(action: String?, extras: Bundle?) {
      when (action) {
        ACTION_FAVOURITE -> BoaAutoBridge.dispatch(this@BoaAutoService, "favourite", BoaAutoStore.playback.mediaId)
        ACTION_FIRE -> BoaAutoBridge.dispatch(this@BoaAutoService, "fire", BoaAutoStore.playback.mediaId)
      }
    }

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
    private const val SPOTLIGHT = "boa:spotlight"
    private const val GENRES = "boa:genres"
    private const val MORE = "boa:more"
    private const val SPOTLIGHT_PER_GENRE = 6
    private const val NOW_PLAYING_URI = "boa://now-playing"
    private const val ACTION_FAVOURITE = "boa:favourite"
    private const val ACTION_FIRE = "boa:fire"
    private const val CATALOGUE_WAIT_MS = 10_000L

    // Android Auto's browse hints (androidx.media's MediaConstants).
    private const val KEY_ROOT_CHILDREN_LIMIT = "androidx.media.MediaBrowserCompat.Extras.KEY_ROOT_CHILDREN_LIMIT"
    private const val CONTENT_STYLE_SUPPORTED = "android.media.browse.CONTENT_STYLE_SUPPORTED"
    private const val CONTENT_STYLE_BROWSABLE_HINT = "android.media.browse.CONTENT_STYLE_BROWSABLE_HINT"
    private const val CONTENT_STYLE_PLAYABLE_HINT = "android.media.browse.CONTENT_STYLE_PLAYABLE_HINT"
    private const val SEARCH_SUPPORTED = "android.media.browse.SEARCH_SUPPORTED"
    private const val CONTENT_STYLE_GROUP_TITLE = "android.media.browse.CONTENT_STYLE_GROUP_TITLE_HINT"
    private const val SLOT_RESERVATION_SKIP_TO_PREV = "android.media.playback.ALWAYS_RESERVE_SPACE_FOR.ACTION_SKIP_TO_PREVIOUS"
    private const val SLOT_RESERVATION_SKIP_TO_NEXT = "android.media.playback.ALWAYS_RESERVE_SPACE_FOR.ACTION_SKIP_TO_NEXT"
    private const val CONTENT_STYLE_GRID = 2

    private var rootTabLimit = 4

    /** The running service, while a car (or another media browser) is connected. */
    @Volatile var current: BoaAutoService? = null
      private set
  }
}
