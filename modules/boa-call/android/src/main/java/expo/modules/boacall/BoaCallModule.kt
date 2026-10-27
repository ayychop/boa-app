package expo.modules.boacall

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** What JS hands over to ring a call (src/calls/incoming.js builds it). */
class IncomingCall : Record {
  @Field val callId: String = ""
  @Field val name: String = ""
  // Their photo (https), shown on the call screen; empty for the BOA logo.
  @Field val avatar: String = ""
  // network.boa://call/... links: opening the call, and answering it.
  @Field val link: String = ""
  @Field val acceptLink: String = ""
  // The ringtone's channel (boa-call-<ringtone>, src/chat/notifications.js).
  @Field val channelId: String = ""
  @Field val timeoutMs: Double = 45000.0
  // The buzz: [wait, buzz, wait, ...] ms on the ringtone's bass hits (src/calls/ringtoneHaptics.js).
  @Field val vibration: List<Double> = emptyList()

  fun info() = CallInfo(callId, name, avatar, link, acceptLink, channelId, timeoutMs.toLong(), vibration.map { it.toLong() }.toLongArray())
}

/**
 * An incoming BOA video call, rung like a phone call. IncomingCallService
 * (a phoneCall foreground service) rings: the ringtone on a loop and the
 * buzz (Ringer), and the call-style notification, whose full-screen intent
 * opens IncomingCallActivity over the lock screen. A locked or sleeping
 * phone wakes straight to it; an unlocked one in use gets the heads-up.
 *
 * Answering opens the app on a network.boa://call link, which CallContext
 * turns into the call. Decline (or swiping it away) stops the ring at once
 * and reaches JS if it's running; otherwise the caller hears "No answer".
 */
class BoaCallModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "No React context" }

  private val manager: NotificationManagerCompat
    get() = NotificationManagerCompat.from(context)

  override fun definition() = ModuleDefinition {
    Name("BoaCall")

    Events("onDecline", "onPipChange")

    OnCreate {
      CallDeclineReceiver.onDecline = { id -> sendEvent("onDecline", mapOf("callId" to id)) }
      CallPip.onChange = { active -> sendEvent("onPipChange", mapOf("active" to active)) }
    }

    OnDestroy {
      CallDeclineReceiver.onDecline = null
      CallPip.onChange = null
    }

    /** A call is on (true) or over (false): leaving the app now floats it picture in picture. */
    AsyncFunction("setPipReady") { ready: Boolean ->
      CallPip.setReady(ready)
    }.runOnQueue(Queues.MAIN)

    /** Whether this phone does picture in picture. */
    Function("isPipSupported") {
      CallPip.supported(appContext.currentActivity)
    }

    /** Rings. False if it couldn't (notifications off), so JS can say so. */
    AsyncFunction("showIncoming") { call: IncomingCall ->
      if (!manager.areNotificationsEnabled()) return@AsyncFunction false
      val info = call.info()
      if (IncomingCallService.ring(context, info)) return@AsyncFunction true
      // Android wouldn't start the service: the notification and the ring without it.
      val notification = CallNotification.build(context, info) ?: return@AsyncFunction false
      try {
        manager.notify(CallNotification.ID, notification)
        Ringer.start(context, info.channelId, info.timeoutMs, info.vibration)
        true
      } catch (e: SecurityException) {
        false
      }
    }

    /** Stops ringing: the call was answered, declined, ended or missed. */
    AsyncFunction("cancelIncoming") {
      IncomingCallService.stop(context)
    }

    /**
     * Whether a call can take over the screen. Android 14+ lets people turn
     * it off for the app (Settings > Apps > Special app access).
     */
    Function("canUseFullScreen") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return@Function true
      (context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager)?.canUseFullScreenIntent() == true
    }

    /** Opens the system setting that allows it. */
    AsyncFunction("openFullScreenSettings") {
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
      } else {
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      }
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }.runOnQueue(Queues.MAIN)

    /** Stops showing over the lock screen once the call is over. */
    AsyncFunction("leaveLockScreen") {
      CallLockScreen.leave()
    }.runOnQueue(Queues.MAIN)
  }
}
