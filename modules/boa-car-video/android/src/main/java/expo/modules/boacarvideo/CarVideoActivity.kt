package expo.modules.boacarvideo

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView

/**
 * A BOA Original on the car's screen, parked only (Media3 ExoPlayer: MP4,
 * HLS). The picture lives only while ParkedMonitor says parked. The moment
 * the car moves (driving restrictions, brake off and out of Park, speed, or
 * GPS), playback pauses, the picture's surface is let go and a static card
 * covers the screen. Nothing resumes by itself: once parked again the card
 * offers Resume, and the driver chooses.
 *
 * It also never starts unless parked, and the car's own blocking screen
 * covers it while driving (it isn't distraction optimised).
 */
class CarVideoActivity : AppCompatActivity() {
  private var player: ExoPlayer? = null
  private lateinit var view: PlayerView
  private lateinit var hold: LinearLayout
  private lateinit var holdTitle: TextView
  private lateinit var holdBody: TextView
  private lateinit var resume: Button
  private var stopWatching: (() -> Unit)? = null
  private var held = true

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
    player = ExoPlayer.Builder(this).build().also { p ->
      p.setMediaItem(
        MediaItem.Builder()
          .setUri(Uri.parse(url))
          .setMediaMetadata(MediaMetadata.Builder().setTitle(title).build())
          .build(),
      )
      p.addListener(object : Player.Listener {
        override fun onPlayerError(error: PlaybackException) {
          holdBody.text = "This video couldn't play."
          hide(showResume = false)
        }
      })
      p.prepare()
    }

    stopWatching = ParkedMonitor.listen(this) { state ->
      if (!state.parked) {
        holdBody.text = if (state.reason == "unknown") "Video plays only when the car is parked, and the car can't confirm it is." else "Video plays only when the car is parked. It has paused."
        hide(showResume = false)
      } else if (held) {
        // Parked (again): offer Resume, never start by itself, except the
        // very first time, when the driver has just pressed play.
        if (!started) show() else cover(showResume = true)
      }
    }
  }

  // Whether it has played yet: after that, only Resume plays it again.
  private var started = false

  /** The picture: surface back on, playing. */
  private fun show() {
    val p = player ?: return
    if (!ParkedMonitor.state.parked) return
    started = true
    held = false
    view.player = p
    view.visibility = View.VISIBLE
    hold.visibility = View.GONE
    p.playWhenReady = true
  }

  /** The car moved: pause, let go of the picture and cover the screen. */
  private fun hide(showResume: Boolean) {
    held = true
    player?.playWhenReady = false
    player?.pause()
    // Detached from the view, the player has no surface: no frame can be drawn.
    view.player = null
    view.visibility = View.INVISIBLE
    cover(showResume)
  }

  /** The static card over the screen; Resume on it only while parked. */
  private fun cover(showResume: Boolean) {
    hold.visibility = View.VISIBLE
    resume.visibility = if (showResume && ParkedMonitor.state.parked) View.VISIBLE else View.GONE
    if (showResume) holdBody.text = "Parked. Pick up where you left off."
  }

  override fun onStart() {
    super.onStart()
    // Back on screen, parked: the card offers Resume.
    if (held && started && ParkedMonitor.state.parked) cover(showResume = true)
  }

  override fun onStop() {
    super.onStop()
    // Off screen (the car's blocking screen, or the driver left): paused.
    if (!held) hide(showResume = false)
  }

  override fun onDestroy() {
    stopWatching?.invoke()
    stopWatching = null
    view.player = null
    player?.release()
    player = null
    super.onDestroy()
  }

  companion object {
    const val EXTRA_URL = "boa.car.video.url"
    const val EXTRA_TITLE = "boa.car.video.title"

    fun intent(context: Context, url: String, title: String): Intent =
      Intent(context, CarVideoActivity::class.java)
        .putExtra(EXTRA_URL, url)
        .putExtra(EXTRA_TITLE, title)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
  }
}
