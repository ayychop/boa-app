package expo.modules.boacall

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationManagerCompat

/**
 * The ring of an incoming call, like the phone's own: the ringtone you
 * chose for calls, looping, on the ring volume, with the call buzz. It
 * follows the phone's ringer switch: Silent rings neither, Vibrate only
 * buzzes. It takes audio focus while it rings, so music pauses, and gives
 * it back after. It stops itself when the ring is over.
 */
object Ringer {
  // Long, pause, long, rest: for a ring that came without the ringtone's own pattern.
  private val PATTERN = longArrayOf(0, 800, 600, 800, 1600)
  private val ATTRS = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
    .build()

  private val handler = Handler(Looper.getMainLooper())
  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private var focus: Any? = null
  private var audio: AudioManager? = null

  /** The ringtone's sound: the chosen ringtone channel's, else the phone's own ringtone. */
  private fun soundOf(context: Context, channelId: String): Uri? {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && channelId.isNotEmpty()) {
      NotificationManagerCompat.from(context).getNotificationChannel(channelId)?.sound?.let { return it }
    }
    return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
  }

  /**
   * Rings. vibration: the ringtone's buzz, one loop long ([wait, buzz, ...]
   * ms, on its bass hits), started with the sound so the two stay in step.
   */
  fun start(context: Context, channelId: String, timeoutMs: Long, vibration: LongArray = LongArray(0)) {
    stop()
    val app = context.applicationContext
    val am = app.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    audio = am
    val mode = am?.ringerMode ?: AudioManager.RINGER_MODE_NORMAL
    if (mode != AudioManager.RINGER_MODE_SILENT) buzz(app, if (vibration.size >= 2) vibration else PATTERN)
    if (mode == AudioManager.RINGER_MODE_NORMAL) play(app, soundOf(app, channelId))
    handler.postDelayed({ stop() }, timeoutMs)
  }

  private fun play(context: Context, uri: Uri?) {
    uri ?: return
    takeFocus()
    player = runCatching {
      MediaPlayer().apply {
        setAudioAttributes(ATTRS)
        setDataSource(context, uri)
        isLooping = true
        setOnPreparedListener { it.start() }
        // A sound that won't play (a removed ringtone) falls back to the phone's own.
        setOnErrorListener { mp, _, _ ->
          mp.release()
          if (player === mp) {
            player = null
            val fallback = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            if (fallback != uri) play(context, fallback)
          }
          true
        }
        prepareAsync()
      }
    }.getOrNull()
  }

  private fun buzz(context: Context, pattern: LongArray) {
    val v = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
    if (v == null || !v.hasVibrator()) return
    vibrator = v
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      @Suppress("DEPRECATION")
      v.vibrate(VibrationEffect.createWaveform(pattern, 0), ATTRS)
    } else {
      @Suppress("DEPRECATION")
      v.vibrate(pattern, 0)
    }
  }

  private fun takeFocus() {
    val am = audio ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(ATTRS).build()
      am.requestAudioFocus(req)
      focus = req
    } else {
      @Suppress("DEPRECATION")
      am.requestAudioFocus(null, AudioManager.STREAM_RING, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
    }
  }

  private fun giveFocus() {
    val am = audio ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      (focus as? AudioFocusRequest)?.let { am.abandonAudioFocusRequest(it) }
    } else {
      @Suppress("DEPRECATION")
      am.abandonAudioFocus(null)
    }
    focus = null
  }

  /** Stops the ring and the buzz. Safe to call any time. */
  fun stop() {
    handler.removeCallbacksAndMessages(null)
    player?.let { p -> runCatching { if (p.isPlaying) p.stop() }; runCatching { p.release() } }
    player = null
    vibrator?.cancel()
    vibrator = null
    giveFocus()
  }
}
