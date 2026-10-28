package expo.modules.boacall

import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Rings an incoming call the way WhatsApp and the phone app do: a
 * foreground service of type phoneCall holds the ringing call notification
 * (and its full-screen call screen) and the Ringer, so Android keeps the
 * app alive for as long as it rings, even when the call's push woke a
 * closed app for a moment. It stops when the call is answered, declined,
 * ended by the caller, or runs out (timeoutMs).
 *
 * Started while the app handles the call's high-priority push, which
 * Android allows from the background.
 */
class IncomingCallService : Service() {
  private val handler = Handler(Looper.getMainLooper())

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val call = CallInfo.from(intent)
    val notification = call?.let { CallNotification.build(this, it) }
    if (call == null || notification == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL else 0
    try {
      ServiceCompat.startForeground(this, CallNotification.ID, notification, type)
    } catch (e: Exception) {
      // Not allowed as a foreground service here: ring with the notification alone.
      runCatching { NotificationManagerCompat.from(this).notify(CallNotification.ID, notification) }
    }
    Ringer.start(this, call.channelId, call.soundUri, call.timeoutMs, call.vibration)
    // A locked phone lights up for the call, like a phone call: the
    // full-screen call screen if Android allows it, else the lock screen
    // with the call on it, never a black screen.
    ScreenWaker.wake(this, WAKE_MS)
    showScreenIfBlocked(call)
    handler.removeCallbacksAndMessages(null)
    handler.postDelayed({ stopSelf() }, call.timeoutMs)
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    Ringer.stop()
    IncomingCallActivity.close()
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    NotificationManagerCompat.from(this).cancel(CallNotification.ID)
    super.onDestroy()
  }

  // Full-screen calls switched off (Android 14+ lets people): with "appear
  // on top" allowed, the call screen can still open itself over the lock
  // screen. Without either, the lit lock screen shows the call.
  private fun showScreenIfBlocked(call: CallInfo) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    if (nm.canUseFullScreenIntent() || !Settings.canDrawOverlays(this)) return
    runCatching { startActivity(call.into(Intent(this, IncomingCallActivity::class.java)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)) }
  }

  companion object {
    private const val WAKE_MS = 10_000L

    /** Starts ringing. False if Android wouldn't start it (the caller rings by notification then). */
    fun ring(context: Context, call: CallInfo): Boolean = try {
      ContextCompat.startForegroundService(context, call.into(Intent(context, IncomingCallService::class.java)))
      true
    } catch (e: Exception) {
      false
    }

    /** Stops ringing, wherever it is: stopService is allowed from anywhere. */
    fun stop(context: Context) {
      Ringer.stop()
      IncomingCallActivity.close()
      runCatching { context.stopService(Intent(context, IncomingCallService::class.java)) }
      NotificationManagerCompat.from(context).cancel(CallNotification.ID)
    }
  }
}
