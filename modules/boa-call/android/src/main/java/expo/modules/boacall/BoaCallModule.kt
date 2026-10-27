package expo.modules.boacall

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.graphics.drawable.IconCompat
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** What JS hands over to ring a call (src/calls/incoming.js builds it). */
class IncomingCall : Record {
  @Field val callId: String = ""
  @Field val name: String = ""
  // network.boa://call/... links: opening the call, and answering it.
  @Field val link: String = ""
  @Field val acceptLink: String = ""
  // The ringtone's channel (boa-call-<ringtone>, src/chat/notifications.js).
  @Field val channelId: String = ""
  @Field val timeoutMs: Double = 45000.0
}

/**
 * An incoming BOA video call, rung like a phone call: a call-style
 * notification (Answer and Decline, the caller, the BOA logo) with a
 * full-screen intent, so a locked or sleeping phone wakes straight to the
 * call screen, and an unlocked one in use gets the heads-up. Its category
 * is CALL, so Do Not Disturb lets it through when calls are allowed.
 *
 * Answering or tapping opens the app on a network.boa://call link, which
 * CallContext turns into the call. Decline (or swiping it away) only
 * reaches JS if it's running; otherwise the caller hears "No answer".
 */
class BoaCallModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "No React context" }

  private val manager: NotificationManagerCompat
    get() = NotificationManagerCompat.from(context)

  private fun smallIcon(): Int {
    // Drawn by the expo-notifications config plugin from app.json's icon.
    val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (id != 0) id else context.applicationInfo.icon
  }

  private fun logo(): Bitmap? = runCatching { BitmapFactory.decodeResource(context.resources, R.drawable.boa_call_logo) }.getOrNull()

  private fun opener(link: String, requestCode: Int): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    // ACTION_VIEW with the link, so React Native's Linking hands it to JS
    // (cold start or not).
    val intent = Intent(launch).apply {
      action = Intent.ACTION_VIEW
      data = Uri.parse(link)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun decliner(callId: String): PendingIntent {
    val intent = Intent(context, CallDeclineReceiver::class.java).putExtra(CallDeclineReceiver.EXTRA_CALL_ID, callId)
    return PendingIntent.getBroadcast(context, REQUEST_DECLINE, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  override fun definition() = ModuleDefinition {
    Name("BoaCall")

    Events("onDecline")

    OnCreate {
      CallDeclineReceiver.onDecline = { id -> sendEvent("onDecline", mapOf("callId" to id)) }
    }

    OnDestroy {
      CallDeclineReceiver.onDecline = null
    }

    /** Rings: posts the call notification. False if it couldn't be posted (no permission). */
    AsyncFunction("showIncoming") { call: IncomingCall ->
      if (!manager.areNotificationsEnabled()) return@AsyncFunction false
      val open = opener(call.link, REQUEST_OPEN) ?: return@AsyncFunction false
      val answer = opener(call.acceptLink, REQUEST_ANSWER) ?: return@AsyncFunction false
      val decline = decliner(call.callId)
      val logo = logo()
      val caller = Person.Builder()
        .setName(call.name)
        .setImportant(true)
        .apply { logo?.let { setIcon(IconCompat.createWithBitmap(it)) } }
        .build()
      val notification = NotificationCompat.Builder(context, call.channelId)
        .setSmallIcon(smallIcon())
        .setLargeIcon(logo)
        .setColor(GOLD)
        .setContentTitle(call.name)
        .setContentText("Incoming video call")
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOngoing(true)
        .setAutoCancel(false)
        .setOnlyAlertOnce(true)
        .setTimeoutAfter(call.timeoutMs.toLong())
        .setContentIntent(open)
        .setFullScreenIntent(open, true)
        // Swiping it away (Android 14 lets you) is declining.
        .setDeleteIntent(decline)
        .addPerson(caller)
        .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, decline, answer).setIsVideo(true))
        .build()
      try {
        manager.notify(NOTIFICATION_ID, notification)
        true
      } catch (e: SecurityException) {
        false
      }
    }

    /** Stops ringing: the call was answered, declined, ended or missed. */
    AsyncFunction("cancelIncoming") {
      manager.cancel(NOTIFICATION_ID)
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

  companion object {
    // One ringing call at a time, so one id.
    const val NOTIFICATION_ID = 0xB0AC
    private const val REQUEST_OPEN = 0xB0A1
    private const val REQUEST_ANSWER = 0xB0A2
    private const val REQUEST_DECLINE = 0xB0A3
    private val GOLD = Color.parseColor("#E2A84B")
  }
}
