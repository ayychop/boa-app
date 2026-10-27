package expo.modules.boacall

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat

/**
 * Decline on the call notification (or swiping it away): stops the ringing
 * at once and tells JS, which tells the caller. Without JS running, the
 * caller's ring just runs out ("No answer").
 */
class CallDeclineReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    NotificationManagerCompat.from(context).cancel(BoaCallModule.NOTIFICATION_ID)
    val id = intent.getStringExtra(EXTRA_CALL_ID) ?: return
    onDecline?.invoke(id)
  }

  companion object {
    const val EXTRA_CALL_ID = "boa.callId"
    // Set while the module (and so JS) is alive.
    @Volatile var onDecline: ((String) -> Unit)? = null
  }
}
