package expo.modules.boacarvideo

import android.content.Intent
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * Where a BOA Original plays in the car, so its sound can outlive its
 * picture. The player lives here, in a media playback service, not in the
 * screen: when the car moves and its blocking screen covers ours, the
 * picture is gone (CarVideoActivity lets go of it and switches the video
 * track off) but the sound plays on, and the car's own media controls,
 * which are safe to use while driving, can pause it.
 *
 * Declared in the car build only (plugins/withAutomotiveVideo.js).
 */
class CarVideoService : MediaSessionService() {
  private var session: MediaSession? = null

  override fun onCreate() {
    super.onCreate()
    val player = ExoPlayer.Builder(this)
      .setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true)
      .setHandleAudioBecomingNoisy(true)
      .build()
    player.addListener(object : Player.Listener {
      // Stopped (Close, or the car's stop button): nothing left to play.
      override fun onPlaybackStateChanged(state: Int) {
        if (state == Player.STATE_IDLE && !player.playWhenReady) stopSelf()
      }
    })
    session = MediaSession.Builder(this, player).setCallback(callback).build()
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo) = session

  // The app swiped away: the video goes with it.
  override fun onTaskRemoved(rootIntent: Intent?) {
    session?.player?.let {
      it.pause()
      it.stop()
    }
    stopSelf()
  }

  override fun onDestroy() {
    session?.run {
      player.release()
      release()
    }
    session = null
    super.onDestroy()
  }

  private val callback = object : MediaSession.Callback {
    // Our own player screen has every command. Anything else (the car's
    // media centre and steering wheel buttons) can only play, pause and
    // stop: never load a video or put a picture on a surface.
    override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
      if (controller.packageName == packageName) return MediaSession.ConnectionResult.AcceptedResultBuilder(session).build()
      val commands = Player.Commands.Builder()
        .addAll(Player.COMMAND_PLAY_PAUSE, Player.COMMAND_STOP, Player.COMMAND_GET_CURRENT_MEDIA_ITEM, Player.COMMAND_GET_METADATA, Player.COMMAND_GET_TIMELINE)
        .build()
      return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
        .setAvailablePlayerCommands(commands)
        .build()
    }

    // The video's address comes across as its request URI; play from it.
    override fun onAddMediaItems(session: MediaSession, controller: MediaSession.ControllerInfo, mediaItems: MutableList<MediaItem>): ListenableFuture<MutableList<MediaItem>> =
      Futures.immediateFuture(
        mediaItems.map { item -> item.requestMetadata.mediaUri?.let { item.buildUpon().setUri(it).build() } ?: item }.toMutableList(),
      )
  }
}
