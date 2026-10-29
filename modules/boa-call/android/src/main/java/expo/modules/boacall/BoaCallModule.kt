package expo.modules.boacall

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
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
  // Your own song (a file:// BOA keeps), which rings instead of the channel's sound.
  @Field val soundUri: String = ""

  fun info() = CallInfo(callId, name, avatar, link, acceptLink, channelId, timeoutMs.toLong(), vibration.map { it.toLong() }.toLongArray(), soundUri)
}

/** A ring with the app on screen: the same Ringer as a call rung by notification, without the notification. */
class Ring : Record {
  @Field val channelId: String = ""
  @Field val soundUri: String = ""
  @Field val timeoutMs: Double = 60000.0
  @Field val vibration: List<Double> = emptyList()
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

  // The power button: the screen going off and on, for a call's camera (src/calls/media.native.js: setAway).
  private var screen: BroadcastReceiver? = null
  // The phone heating up: drop the call camera to 720p60 (src/calls/thermal.js).
  private var thermal: PowerManager.OnThermalStatusChangedListener? = null

  override fun definition() = ModuleDefinition {
    Name("BoaCall")

    Events("onDecline", "onPipChange", "onHangUp", "onScreenChange", "onThermalChange", "onPipAction")

    OnCreate {
      CallDeclineReceiver.onDecline = { id -> sendEvent("onDecline", mapOf("callId" to id)) }
      CallDeclineReceiver.onHangUp = { sendEvent("onHangUp", emptyMap<String, Any>()) }
      CallPip.onChange = { active -> sendEvent("onPipChange", mapOf("active" to active)) }
      // Mute / End tapped on the floating call window (CallPipReceiver).
      CallPipReceiver.onAction = { action -> sendEvent("onPipAction", mapOf("action" to action)) }
      val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, intent: Intent) {
          sendEvent("onScreenChange", mapOf("on" to (intent.action == Intent.ACTION_SCREEN_ON)))
        }
      }
      val filter = IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_OFF)
        addAction(Intent.ACTION_SCREEN_ON)
      }
      // System broadcasts still arrive not exported; nothing from other apps does.
      appContext.reactContext?.let { c -> runCatching { ContextCompat.registerReceiver(c, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED) } }
      screen = receiver
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val pm = appContext.reactContext?.getSystemService(Context.POWER_SERVICE) as? PowerManager
        if (pm != null) {
          val listener = PowerManager.OnThermalStatusChangedListener { status ->
            sendEvent("onThermalChange", mapOf("status" to thermalName(status)))
          }
          runCatching { pm.addThermalStatusListener(listener) }
          thermal = listener
        }
      }
    }

    OnDestroy {
      CallDeclineReceiver.onDecline = null
      CallDeclineReceiver.onHangUp = null
      CallPip.onChange = null
      CallPipReceiver.onAction = null
      screen?.let { r -> runCatching { appContext.reactContext?.unregisterReceiver(r) } }
      screen = null
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        thermal?.let { listener ->
          val pm = appContext.reactContext?.getSystemService(Context.POWER_SERVICE) as? PowerManager
          runCatching { pm?.removeThermalStatusListener(listener) }
        }
      }
      thermal = null
    }

    /** A call is on (placed, or answered): hold it in the foreground so the screen can go off. */
    AsyncFunction("startOngoing") { name: String, callId: String ->
      OngoingCallService.start(context, name, callId)
    }

    /** The call is over. */
    AsyncFunction("stopOngoing") {
      OngoingCallService.stop(context)
    }

    /** A call is on (true) or over (false): leaving the app now floats it picture in picture. */
    AsyncFunction("setPipReady") { ready: Boolean ->
      CallPip.setReady(ready)
    }.runOnQueue(Queues.MAIN)

    /** Whether this phone does picture in picture. */
    Function("isPipSupported") {
      CallPip.supported(appContext.currentActivity)
    }

    /** The call's mute state, so the floating window's Mute button matches it. */
    AsyncFunction("setPipMuted") { muted: Boolean ->
      CallPip.setMuted(muted)
    }.runOnQueue(Queues.MAIN)

    /** Rings. False if it couldn't (notifications off), so JS can say so. */
    AsyncFunction("showIncoming") { call: IncomingCall ->
      if (!manager.areNotificationsEnabled()) return@AsyncFunction false
      val info = call.info()
      if (IncomingCallService.ring(context, info)) return@AsyncFunction true
      // Android wouldn't start the service: the notification and the ring without it.
      val notification = CallNotification.build(context, info) ?: return@AsyncFunction false
      try {
        manager.notify(CallNotification.ID, notification)
        Ringer.start(context, info.channelId, info.soundUri, info.timeoutMs, info.vibration)
        ScreenWaker.wake(context, 10_000L)
        true
      } catch (e: SecurityException) {
        false
      }
    }

    /**
     * Rings with the app on screen, as the phone does: on the ring volume,
     * following Silent and Vibrate. The sound: soundUri, else channelId's,
     * else the phone's own ringtone.
     */
    AsyncFunction("startRinger") { ring: Ring ->
      Ringer.start(context, ring.channelId, ring.soundUri, ring.timeoutMs.toLong(), ring.vibration.map { it.toLong() }.toLongArray())
    }.runOnQueue(Queues.MAIN)

    /** Stops that ring (and any other: there's only ever one). */
    AsyncFunction("stopRinger") {
      Ringer.stop()
    }.runOnQueue(Queues.MAIN)

    /**
     * A call needs you and the screen is off (they answered your call while
     * the phone was locked): the screen comes on and the call shows over the
     * lock screen, until the call is over (leaveLockScreen).
     */
    AsyncFunction("wakeForCall") {
      ScreenWaker.wake(context, 10_000L)
      CallLockScreen.show()
    }.runOnQueue(Queues.MAIN)

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

    /** NOMINAL, FAIR, WARNING or CRITICAL — WARNING+ cools the camera to 720p60. */
    Function("thermalState") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return@Function "NOMINAL"
      val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return@Function "NOMINAL"
      thermalName(pm.currentThermalStatus)
    }
  }
}

private fun thermalName(status: Int): String = when (status) {
  PowerManager.THERMAL_STATUS_NONE -> "NOMINAL"
  PowerManager.THERMAL_STATUS_LIGHT, PowerManager.THERMAL_STATUS_MODERATE -> "FAIR"
  PowerManager.THERMAL_STATUS_SEVERE -> "WARNING"
  else -> "CRITICAL"
}
