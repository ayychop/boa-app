package expo.modules.boacall

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.graphics.drawable.IconCompat

/** One ringing call, as it travels between the module, the service and the call screen. */
data class CallInfo(
  val callId: String,
  val name: String,
  val avatar: String,
  // network.boa://call/... links: opening the call, and answering it.
  val link: String,
  val acceptLink: String,
  // The ringtone's channel (boa-call-<ringtone>, src/chat/notifications.js): its sound is the ring.
  val channelId: String,
  val timeoutMs: Long,
  // The buzz on the ringtone's bass hits; empty for the standard call buzz.
  val vibration: LongArray = LongArray(0),
  // Your own song's file, which rings instead of the channel's sound; empty if none.
  val soundUri: String = "",
) {
  fun into(intent: Intent): Intent = intent.putExtras(
    Bundle().apply {
      putString(K_ID, callId)
      putString(K_NAME, name)
      putString(K_AVATAR, avatar)
      putString(K_LINK, link)
      putString(K_ACCEPT, acceptLink)
      putString(K_CHANNEL, channelId)
      putLong(K_TIMEOUT, timeoutMs)
      putLongArray(K_VIBRATION, vibration)
      putString(K_SOUND, soundUri)
    },
  )

  companion object {
    private const val K_ID = "boa.call.id"
    private const val K_NAME = "boa.call.name"
    private const val K_AVATAR = "boa.call.avatar"
    private const val K_LINK = "boa.call.link"
    private const val K_ACCEPT = "boa.call.accept"
    private const val K_CHANNEL = "boa.call.channel"
    private const val K_TIMEOUT = "boa.call.timeout"
    private const val K_VIBRATION = "boa.call.vibration"
    private const val K_SOUND = "boa.call.sound"

    fun from(intent: Intent?): CallInfo? {
      val e = intent?.extras ?: return null
      val id = e.getString(K_ID).orEmpty()
      if (id.isEmpty()) return null
      return CallInfo(
        callId = id,
        name = e.getString(K_NAME).orEmpty().ifEmpty { "BOA HUB member" },
        avatar = e.getString(K_AVATAR).orEmpty(),
        link = e.getString(K_LINK).orEmpty(),
        acceptLink = e.getString(K_ACCEPT).orEmpty(),
        channelId = e.getString(K_CHANNEL).orEmpty(),
        timeoutMs = e.getLong(K_TIMEOUT, 45000L),
        vibration = e.getLongArray(K_VIBRATION) ?: LongArray(0),
        soundUri = e.getString(K_SOUND).orEmpty(),
      )
    }
  }
}

/**
 * The incoming-call notification: call style (the caller, Answer and
 * Decline, the BOA logo), category CALL so Do Not Disturb lets it through
 * when calls are allowed, and a full-screen intent to BOA's own incoming
 * call screen (IncomingCallActivity), which a locked or sleeping phone
 * wakes straight to. An unlocked phone in use gets the heads-up instead.
 *
 * It posts on its own silent channel: the ring is the Ringer's, looping
 * the ringtone you chose until the call is answered, declined or missed,
 * where a notification's own sound would play once and stop.
 */
object CallNotification {
  // One ringing call at a time, so one id.
  const val ID = 0xB0AC
  private const val CHANNEL = "boa-call-incoming"
  private const val REQUEST_OPEN = 0xB0A1
  private const val REQUEST_ANSWER = 0xB0A2
  private const val REQUEST_DECLINE = 0xB0A3
  private const val REQUEST_SCREEN = 0xB0A4
  private val GOLD = Color.parseColor("#E2A84B")
  private const val FLAGS = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

  fun logo(context: Context): Bitmap? = runCatching { BitmapFactory.decodeResource(context.resources, R.drawable.boa_call_logo) }.getOrNull()

  private fun smallIcon(context: Context): Int {
    // Drawn by the expo-notifications config plugin from app.json's icon.
    val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (id != 0) id else context.applicationInfo.icon
  }

  private fun ensureChannel(context: Context) {
    val channel = NotificationChannelCompat.Builder(CHANNEL, NotificationManagerCompat.IMPORTANCE_HIGH)
      .setName("Incoming calls")
      .setDescription("BOA video calls ringing in")
      .setSound(null, null)
      .setVibrationEnabled(false)
      .setLightsEnabled(true)
      .setLightColor(GOLD)
      .build()
    NotificationManagerCompat.from(context).createNotificationChannel(channel)
  }

  /** Opens the app on a call link (React Native's Linking hands it to JS, cold start or not). */
  fun appIntent(context: Context, link: String): Intent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    return Intent(launch).apply {
      action = Intent.ACTION_VIEW
      data = Uri.parse(link)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
  }

  private fun screen(context: Context, call: CallInfo, action: String?, request: Int): PendingIntent {
    val intent = call.into(Intent(context, IncomingCallActivity::class.java)).apply {
      this.action = action
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
    }
    return PendingIntent.getActivity(context, request, intent, FLAGS)
  }

  fun decliner(context: Context, callId: String): PendingIntent {
    val intent = Intent(context, CallDeclineReceiver::class.java).putExtra(CallDeclineReceiver.EXTRA_CALL_ID, callId)
    return PendingIntent.getBroadcast(context, REQUEST_DECLINE, intent, FLAGS)
  }

  fun build(context: Context, call: CallInfo): android.app.Notification? {
    ensureChannel(context)
    val open = appIntent(context, call.link)?.let { PendingIntent.getActivity(context, REQUEST_OPEN, it, FLAGS) } ?: return null
    // Answer goes through the call screen, which stops the ring at once,
    // then opens the app answering (an activity, not a trampoline).
    val answer = screen(context, call, IncomingCallActivity.ACTION_ANSWER, REQUEST_ANSWER)
    val fullScreen = screen(context, call, null, REQUEST_SCREEN)
    val decline = decliner(context, call.callId)
    val logo = logo(context)
    val caller = Person.Builder()
      .setName(call.name)
      .setImportant(true)
      .apply { logo?.let { setIcon(IconCompat.createWithBitmap(it)) } }
      .build()
    return NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(smallIcon(context))
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
      .setTimeoutAfter(call.timeoutMs)
      .setContentIntent(open)
      .setFullScreenIntent(fullScreen, true)
      // Swiping it away (Android 14 lets you) is declining.
      .setDeleteIntent(decline)
      .addPerson(caller)
      .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, decline, answer).setIsVideo(true))
      .build()
  }
}
