package expo.modules.boacarvideo

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import androidx.media3.ui.PlayerView
import com.google.common.util.concurrent.ListenableFuture

/**
 * A BOA Original on the car's screen (Media3: MP4, HLS), played through
 * CarVideoService. The picture lives only while ParkedMonitor says parked.
 * The moment the car moves (driving restrictions, brake off and out of
 * Park, speed, or GPS), the picture's surface is let go, the video track is
 * switched off (not decoded at all) and a static card covers the screen.
 *
 * With AUDIO_WHILE_DRIVING the sound carries on, audio only, and the car's
 * media controls can pause it; without it, everything pauses. Either way
 * the picture never comes back by itself: once parked again the card
 * offers it back, and the driver chooses.
 *
 * It also never starts unless parked, and the car's own blocking screen
 * covers it while driving (it isn't distraction optimised).
 */
class CarVideoActivity : AppCompatActivity() {
  private var controllerFuture: ListenableFuture<MediaController>? = null
  private var player: MediaController? = null
  private lateinit var view: PlayerView
  private lateinit var hold: LinearLayout
  private lateinit var holdTitle: TextView
  private lateinit var holdBody: TextView
  private lateinit var resume: Button
  private val main = Handler(Looper.getMainLooper())
  private var stopWatching: (() -> Unit)? = null
  // The picture is off: covered by the card, with or without sound.
  private var held = true
  // Whether it has played yet: after that, only Resume brings the picture back.
  private var started = false
  private var visible = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(R.layout.boa_car_video)
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    view = findViewById(R.id.boa_car_player)
    hold = findViewById(R.id.boa_car_hold)
    holdTitle = findViewById(R.id.boa_car_hold_title)
    holdBody = findViewById(R.id.boa_car_hold_body)
    resume = findViewById(R.id.boa_car_resume)
    findViewById<Button>(R.id.boa_car_close).setOnClickListener { finish() }
    resume.setOnClickListener { if (ParkedMonitor.state.parked) show() }

    val url = intent.getStringExtra(EXTRA_URL)
    if (url.isNullOrBlank()) {
      finish()
      return
    }
    val title = intent.getStringExtra(EXTRA_TITLE).orEmpty()
    holdTitle.text = title

    val token = SessionToken(this, ComponentName(this, CarVideoService::class.java))
    val future = MediaController.Builder(this, token).buildAsync()
    controllerFuture = future
    future.addListener({
      val c = runCatching { future.get() }.getOrNull()
      if (c == null || isDestroyed) {
        holdBody.text = "This video couldn't play."
        cover(showResume = false)
        return@addListener
      }
      connected(c, url, title)
    }, ContextCompat.getMainExecutor(this))
  }

  private fun connected(p: MediaController, url: String, title: String) {
    player = p
    // A new video replaces whatever was playing in the car. Picture off
    // until parked is confirmed.
    setPicture(p, false)
    p.setMediaItem(
      MediaItem.Builder()
        .setUri(Uri.parse(url))
        .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(Uri.parse(url)).build())
        .setMediaMetadata(MediaMetadata.Builder().setTitle(title).setArtist("BOA Originals").build())
        .build(),
    )
    p.prepare()
    p.addListener(object : Player.Listener {
      override fun onPlayerError(error: PlaybackException) {
        holdBody.text = "This video couldn't play."
        hide(showResume = false)
      }
    })

    stopWatching = ParkedMonitor.listen(this) { state ->
      if (!state.parked) {
        if (AUDIO_WHILE_DRIVING && started && p.playWhenReady) {
          audioOnly()
        } else {
          holdBody.text = if (state.reason == "unknown") "Video plays only when the car is parked, and the car can't confirm it is." else "Video plays only when the car is parked. It has paused."
          hide(showResume = false)
        }
      } else if (held) {
        // Parked (again): offer the picture back, never bring it back by
        // itself, except the very first time, when the driver has just
        // pressed play.
        if (!started) show() else cover(showResume = true)
      }
    }
  }

  /** The picture: video track on, surface back, playing. */
  private fun show() {
    val p = player ?: return
    if (!ParkedMonitor.state.parked) return
    started = true
    held = false
    setPicture(p, true)
    view.player = p
    view.visibility = View.VISIBLE
    hold.visibility = View.GONE
    p.playWhenReady = true
  }

  /** The car moved, sound allowed: the picture goes, the sound plays on. */
  private fun audioOnly() {
    held = true
    dropPicture()
    holdBody.text = "Audio only while you drive. The picture comes back when you park."
    cover(showResume = false)
  }

  /** The car moved (or the video failed): pause, let go of the picture and cover the screen. */
  private fun hide(showResume: Boolean) {
    held = true
    player?.playWhenReady = false
    player?.pause()
    dropPicture()
    cover(showResume)
  }

  // Detached from the view, the player has no surface: no frame can be
  // drawn. With the video track off as well, none is even decoded.
  private fun dropPicture() {
    player?.let { setPicture(it, false) }
    view.player = null
    view.visibility = View.INVISIBLE
  }

  private fun setPicture(p: Player, on: Boolean) {
    p.trackSelectionParameters = p.trackSelectionParameters.buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_VIDEO, !on).build()
  }

  /** The static card over the screen; Resume on it only while parked. */
  private fun cover(showResume: Boolean) {
    hold.visibility = View.VISIBLE
    val parked = ParkedMonitor.state.parked
    resume.visibility = if (showResume && parked) View.VISIBLE else View.GONE
    if (!showResume || !parked) return
    val playing = player?.playWhenReady == true
    resume.text = if (playing) "Show picture" else "Resume"
    holdBody.text = if (playing) "Parked. The picture is ready when you are." else "Parked. Pick up where you left off."
  }

  override fun onStart() {
    super.onStart()
    visible = true
    main.removeCallbacks(offScreen)
    // Back on screen, parked: the card offers the picture back.
    if (held && started && ParkedMonitor.state.parked) cover(showResume = true)
  }

  override fun onStop() {
    super.onStop()
    visible = false
    // Off screen. The car's blocking screen (driving) is for the parked
    // listener to handle, and its signal can land just after the screen
    // goes, so wait a moment; if it doesn't come, the driver left: pause.
    if (!held) main.postDelayed(offScreen, OFF_SCREEN_GRACE_MS)
  }

  private val offScreen = Runnable { if (!visible && !held) hide(showResume = false) }

  override fun onDestroy() {
    main.removeCallbacksAndMessages(null)
    stopWatching?.invoke()
    stopWatching = null
    if (::view.isInitialized) view.player = null
    // Closed (Close, or back): the video ends, sound and all.
    if (isFinishing) player?.run {
      pause()
      stop()
      clearMediaItems()
    }
    player = null
    controllerFuture?.let { MediaController.releaseFuture(it) }
    controllerFuture = null
    super.onDestroy()
  }

  companion object {
    const val EXTRA_URL = "boa.car.video.url"
    const val EXTRA_TITLE = "boa.car.video.title"

    /** True: the sound plays on while driving, picture off. False: everything pauses. */
    const val AUDIO_WHILE_DRIVING = true

    private const val OFF_SCREEN_GRACE_MS = 1500L

    fun intent(context: Context, url: String, title: String): Intent =
      Intent(context, CarVideoActivity::class.java)
        .putExtra(EXTRA_URL, url)
        .putExtra(EXTRA_TITLE, title)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
  }
}
