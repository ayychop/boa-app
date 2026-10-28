package expo.modules.boacall

import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.core.graphics.drawable.IconCompat

/**
 * Keeps a call going with the screen off, like WhatsApp: from the moment a
 * call is on until it's over, a foreground service of type phoneCall and
 * microphone holds the ongoing-call notification (their name, Hang up), so
 * Android doesn't freeze the app or cut the microphone when the power
 * button is pressed or the app is left. The camera rests meanwhile (JS
 * pauses it, src/calls/media.native.js: setAway), so it needs no camera type.
 *
 * Started from JS while the app is on screen (a call placed or answered);
 * Android 14 refuses the microphone type from the background, and refuses
 * it too before the microphone is allowed, so it falls back to phoneCall
 * alone, and JS starts it again once the call is live to add it.
 */
class OngoingCallService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val name = intent?.getStringExtra(EXTRA_NAME).orEmpty().ifEmpty { "BOA HUB member" }
    val callId = intent?.getStringExtra(EXTRA_CALL_ID).orEmpty()
    val notification = build(this, name, callId)
    if (notification == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    if (!foreground(notification, withMic = true) && !foreground(notification, withMic = false)) {
      // Android wouldn't hold it in the foreground: the call goes on as long as the app does.
      stopSelf()
    }
    return START_NOT_STICKY
  }

  private fun foreground(notification: android.app.Notification, withMic: Boolean): Boolean {
    var type = 0
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) type = ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
    if (withMic && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
    return try {
      ServiceCompat.startForeground(this, ID, notification, type)
      true
    } catch (e: Exception) {
      false
    }
  }

  // Swiped out of Recents mid-call: the call screen is gone, so is the call.
  override fun onTaskRemoved(rootIntent: Intent?) {
    CallDeclineReceiver.onHangUp?.invoke()
    stopSelf()
  }

  override fun onDestroy() {
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    NotificationManagerCompat.from(this).cancel(ID)
    super.onDestroy()
  }

  companion object {
    const val ID = 0xB0AD
    private const val CHANNEL = "boa-call-ongoing"
    private const val REQUEST_OPEN = 0xB0A5
    private const val REQUEST_HANG_UP = 0xB0A6
    private const val EXTRA_NAME = "boa.call.name"
    private const val EXTRA_CALL_ID = "boa.call.id"
    private const val FLAGS = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

    private fun ensureChannel(context: Context) {
      // Low importance: no sound or heads-up, just there in the shade and the status bar.
      val channel = NotificationChannelCompat.Builder(CHANNEL, NotificationManagerCompat.IMPORTANCE_LOW)
        .setName("Ongoing calls")
        .setDescription("A BOA video call in progress")
        .setSound(null, null)
        .setVibrationEnabled(false)
        .build()
      NotificationManagerCompat.from(context).createNotificationChannel(channel)
    }

    private fun smallIcon(context: Context): Int {
      val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
      return if (id != 0) id else context.applicationInfo.icon
    }

    fun build(context: Context, name: String, callId: String): android.app.Notification? {
      ensureChannel(context)
      // Back into the app, to the call (it's still on the call screen or its floating window).
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      val open = PendingIntent.getActivity(context, REQUEST_OPEN, launch, FLAGS)
      val hangUp = PendingIntent.getBroadcast(
        context,
        REQUEST_HANG_UP,
        Intent(context, CallDeclineReceiver::class.java).setAction(CallDeclineReceiver.ACTION_HANG_UP).putExtra(CallDeclineReceiver.EXTRA_CALL_ID, callId),
        FLAGS,
      )
      val logo = CallNotification.logo(context)
      val person = Person.Builder()
        .setName(name)
        .setImportant(true)
        .apply { logo?.let { setIcon(IconCompat.createWithBitmap(it)) } }
        .build()
      return NotificationCompat.Builder(context, CHANNEL)
        .setSmallIcon(smallIcon(context))
        .setLargeIcon(logo)
        .setColor(android.graphics.Color.parseColor("#E2A84B"))
        .setContentTitle(name)
        .setContentText("BOA video call")
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setUsesChronometer(true)
        .setContentIntent(open)
        .addPerson(person)
        .setStyle(NotificationCompat.CallStyle.forOngoingCall(person, hangUp).setIsVideo(true))
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        .build()
    }

    /** A call is on: hold it in the foreground. Calling it again (the call went live) only refreshes it. */
    fun start(context: Context, name: String, callId: String): Boolean = try {
      val intent = Intent(context, OngoingCallService::class.java).putExtra(EXTRA_NAME, name).putExtra(EXTRA_CALL_ID, callId)
      ContextCompat.startForegroundService(context, intent)
      true
    } catch (e: Exception) {
      false
    }

    /** The call is over. */
    fun stop(context: Context) {
      runCatching { context.stopService(Intent(context, OngoingCallService::class.java)) }
      NotificationManagerCompat.from(context).cancel(ID)
    }
  }
}
