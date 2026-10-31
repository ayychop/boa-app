package expo.modules.boaalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.content.ContextCompat

/**
 * An alarm ringing: a foreground service (mediaPlayback), so Android keeps
 * the app alive and awake however it was started and however long the
 * phone has been asleep. It plays the station at alarm volume, rising
 * gently, and never lets the room go silent: while the stream is connecting,
 * or if it drops (no signal, a dead station), BOA's chimes play and the
 * stream is retried until it takes over. It stops itself after half an hour.
 *
 * The notification carries Snooze and Stop and opens AlarmActivity over
 * the lock screen.
 */
class AlarmService : Service() {
  companion object {
    const val ACTION_START = "expo.modules.boaalarm.START"
    const val ACTION_STOP = "expo.modules.boaalarm.STOP"
    const val ACTION_SNOOZE = "expo.modules.boaalarm.SNOOZE"
    const val ACTION_STATE = "expo.modules.boaalarm.STATE"
    const val EXTRA_STATE = "state"
    const val SNOOZE_MINUTES = 9
    private const val CHANNEL = "boa_alarm_radio"
    private const val NOTIFICATION_ID = 7310
    private const val CONNECT_GRACE_MS = 10_000L
    private const val RAMP_STEP_MS = 700L
    private const val MAX_RING_MS = 30 * 60_000L

    /** The alarm ringing now, or null. */
    @Volatile var current: AlarmStore.Alarm? = null

    fun start(c: Context, a: AlarmStore.Alarm) {
      val i = Intent(c, AlarmService::class.java).setAction(ACTION_START).also { putAlarm(it, a) }
      try {
        ContextCompat.startForegroundService(c, i)
      } catch (_: Exception) {
        // Android refused a service from the background: show the alarm page
        // by full-screen notification; the page, in front, starts the service.
        postPageNotification(c, a)
      }
    }

    fun putAlarm(i: Intent, a: AlarmStore.Alarm) {
      i.putExtra(AlarmScheduler.EXTRA_ID, a.id)
      i.putExtra(AlarmScheduler.EXTRA_NAME, a.name)
      i.putExtra(AlarmScheduler.EXTRA_STATION, a.station)
      i.putExtra(AlarmScheduler.EXTRA_URL, a.url)
    }

    fun readAlarm(i: Intent): AlarmStore.Alarm? {
      val id = i.getStringExtra(AlarmScheduler.EXTRA_ID) ?: return null
      val url = i.getStringExtra(AlarmScheduler.EXTRA_URL) ?: return null
      return AlarmStore.Alarm(id, i.getStringExtra(AlarmScheduler.EXTRA_NAME) ?: "BOA Alarm", 0, 0, emptyList(), i.getStringExtra(AlarmScheduler.EXTRA_STATION) ?: "", url)
    }

    fun command(c: Context, action: String) {
      try {
        c.startService(Intent(c, AlarmService::class.java).setAction(action))
      } catch (_: Exception) {
      }
    }

    private fun ensureChannel(c: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val nm = c.getSystemService(NotificationManager::class.java)
      if (nm.getNotificationChannel(CHANNEL) != null) return
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL, "Radio alarm", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "The alarm that wakes you to BOA Radio"
          setSound(null, null)
          enableVibration(false)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
          setBypassDnd(true)
        },
      )
    }

    private fun pageIntent(c: Context, a: AlarmStore.Alarm): PendingIntent {
      val i = Intent(c, AlarmActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        .also { putAlarm(it, a) }
      return PendingIntent.getActivity(c, 11, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun actionIntent(c: Context, action: String, code: Int): PendingIntent =
      PendingIntent.getService(c, code, Intent(c, AlarmService::class.java).setAction(action), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    fun build(c: Context, a: AlarmStore.Alarm, withActions: Boolean): Notification {
      ensureChannel(c)
      val b: Notification.Builder
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        b = Notification.Builder(c, CHANNEL)
      } else {
        @Suppress("DEPRECATION")
        b = Notification.Builder(c)
      }
      val icon = c.resources.getIdentifier("notification_icon", "drawable", c.packageName).takeIf { it != 0 } ?: c.applicationInfo.icon
      b.setSmallIcon(icon)
        .setContentTitle(a.name.ifEmpty { "BOA Alarm" })
        .setContentText(if (a.station.isNotEmpty()) "Waking up to ${a.station}" else "Good morning")
        .setCategory(Notification.CATEGORY_ALARM)
        .setOngoing(true)
        .setAutoCancel(false)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .setContentIntent(pageIntent(c, a))
        .setFullScreenIntent(pageIntent(c, a), true)
      if (withActions) {
        b.addAction(Notification.Action.Builder(null, "Snooze $SNOOZE_MINUTES min", actionIntent(c, ACTION_SNOOZE, 12)).build())
        b.addAction(Notification.Action.Builder(null, "Stop", actionIntent(c, ACTION_STOP, 13)).build())
      }
      return b.build()
    }

    private fun postPageNotification(c: Context, a: AlarmStore.Alarm) {
      try {
        c.getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, build(c, a, false))
      } catch (_: Exception) {
      }
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private var player: MediaPlayer? = null
  private var tone: MediaPlayer? = null
  private var wake: PowerManager.WakeLock? = null
  private var focus: AudioFocusRequest? = null
  private var alarm: AlarmStore.Alarm? = null
  private var ringing = false
  private var attempts = 0
  private var volume = 0.15f

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        finishRinging("stopped")
        return START_NOT_STICKY
      }
      ACTION_SNOOZE -> {
        alarm?.let { AlarmScheduler.snooze(this, it, SNOOZE_MINUTES) }
        finishRinging("snoozed")
        return START_NOT_STICKY
      }
    }
    val a = intent?.let { readAlarm(it) } ?: alarm
    if (a == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    // The foreground promotion has to come first: Android allows only a few seconds.
    promote(a)
    if (ringing) return START_REDELIVER_INTENT
    alarm = a
    current = a
    ringing = true
    attempts = 0
    volume = 0.15f
    holdAwake()
    raiseAlarmVolume()
    takeFocus()
    openStream()
    // Not connected in time: the chimes cover the silence until it is.
    handler.postDelayed({ if (ringing && !streaming()) ensureTone() }, CONNECT_GRACE_MS)
    handler.postDelayed(ramp, RAMP_STEP_MS)
    handler.postDelayed({ finishRinging("stopped") }, MAX_RING_MS)
    broadcast("ringing")
    return START_REDELIVER_INTENT
  }

  override fun onDestroy() {
    if (ringing) finishRinging("stopped")
    super.onDestroy()
  }

  private fun promote(a: AlarmStore.Alarm) {
    val n = build(this, a, true)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      else startForeground(NOTIFICATION_ID, n)
    } catch (_: Exception) {
      // Not allowed to run as a foreground service from here: the full-screen
      // page (AlarmActivity) takes over and starts it from the front.
      postPageNotification(this, a)
    }
  }

  private fun alarmAttributes() = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_ALARM)
    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
    .build()

  private fun holdAwake() {
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "boa:alarm").apply {
      setReferenceCounted(false)
      acquire(MAX_RING_MS + 60_000L)
    }
  }

  /** An alarm nobody can hear is no alarm: lift a very low alarm volume to a safe level. */
  private fun raiseAlarmVolume() {
    try {
      val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM)
      val floor = (max * 0.5f).toInt().coerceAtLeast(1)
      if (am.getStreamVolume(AudioManager.STREAM_ALARM) < floor) am.setStreamVolume(AudioManager.STREAM_ALARM, floor, 0)
    } catch (_: Exception) {
    }
  }

  private fun takeFocus() {
    try {
      val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val r = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(alarmAttributes()).build()
        focus = r
        am.requestAudioFocus(r)
      }
    } catch (_: Exception) {
    }
  }

  private fun streaming() = try {
    player?.isPlaying == true
  } catch (_: Exception) {
    false
  }

  private fun openStream() {
    val a = alarm ?: return
    releasePlayer()
    val p = MediaPlayer()
    player = p
    try {
      p.setAudioAttributes(alarmAttributes())
      p.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK)
      p.setOnPreparedListener {
        if (player !== it) return@setOnPreparedListener
        releaseTone()
        attempts = 0
        it.setVolume(volume, volume)
        it.start()
      }
      p.setOnErrorListener { mp, _, _ ->
        if (player === mp) retry()
        true
      }
      // A live stream doesn't end: if it does, the connection has dropped.
      p.setOnCompletionListener { mp -> if (player === mp) retry() }
      p.setDataSource(a.url)
      p.prepareAsync()
    } catch (_: Exception) {
      retry()
    }
  }

  private fun retry() {
    if (!ringing) return
    releasePlayer()
    attempts += 1
    ensureTone()
    handler.postDelayed({ if (ringing && !streaming()) openStream() }, (1500L * attempts).coerceAtMost(8000L))
  }

  /** BOA's chimes (the alarm sound shipped with the app), or the phone's own alarm tone. */
  private fun ensureTone() {
    if (tone != null || !ringing) return
    try {
      val raw = resources.getIdentifier("alarm_chimes", "raw", packageName)
      val uri = if (raw != 0) Uri.parse("android.resource://$packageName/$raw") else RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      val t = MediaPlayer()
      t.setAudioAttributes(alarmAttributes())
      t.setDataSource(this, uri)
      t.isLooping = true
      t.setVolume(volume, volume)
      t.setOnPreparedListener { it.start() }
      t.prepareAsync()
      tone = t
    } catch (_: Exception) {
    }
  }

  private val ramp = object : Runnable {
    override fun run() {
      if (!ringing) return
      volume = (volume + 0.05f).coerceAtMost(1f)
      try {
        player?.setVolume(volume, volume)
        tone?.setVolume(volume, volume)
      } catch (_: Exception) {
      }
      if (volume < 1f) handler.postDelayed(this, RAMP_STEP_MS)
    }
  }

  private fun releasePlayer() {
    val p = player
    player = null
    try {
      p?.setOnPreparedListener(null)
      p?.setOnErrorListener(null)
      p?.setOnCompletionListener(null)
      p?.reset()
      p?.release()
    } catch (_: Exception) {
    }
  }

  private fun releaseTone() {
    val t = tone
    tone = null
    try {
      t?.stop()
      t?.release()
    } catch (_: Exception) {
    }
  }

  private fun broadcast(state: String) {
    try {
      sendBroadcast(
        Intent(ACTION_STATE).setPackage(packageName).putExtra(EXTRA_STATE, state)
          .putExtra(AlarmScheduler.EXTRA_ID, alarm?.id ?: "")
          .putExtra(AlarmScheduler.EXTRA_NAME, alarm?.name ?: "")
          .putExtra(AlarmScheduler.EXTRA_STATION, alarm?.station ?: ""),
      )
    } catch (_: Exception) {
    }
  }

  private fun finishRinging(state: String) {
    if (!ringing && state == "stopped" && alarm == null) {
      stopSelf()
      return
    }
    ringing = false
    handler.removeCallbacksAndMessages(null)
    releasePlayer()
    releaseTone()
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) focus?.let { (getSystemService(Context.AUDIO_SERVICE) as AudioManager).abandonAudioFocusRequest(it) }
    } catch (_: Exception) {
    }
    focus = null
    try {
      wake?.takeIf { it.isHeld }?.release()
    } catch (_: Exception) {
    }
    wake = null
    broadcast(state)
    current = null
    alarm = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    try {
      getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID)
    } catch (_: Exception) {
    }
    stopSelf()
  }
}
