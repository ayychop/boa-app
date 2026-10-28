package expo.modules.boacall

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Decline on the call notification (or swiping it away): stops the ringing
 * at once and tells JS, which tells the caller. Without JS running, the
 * caller's ring just runs out ("No answer"). Hang up on the ongoing-call
 * notification (OngoingCallService) comes here too, as ACTION_HANG_UP.
 */
class CallDeclineReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == ACTION_HANG_UP) {
      onHangUp?.invoke()
      // No JS to end it: the notification goes anyway, and the other side's call drops with the app.
      if (onHangUp == null) OngoingCallService.stop(context)
      return
    }
    IncomingCallService.stop(context)
    val id = intent.getStringExtra(EXTRA_CALL_ID) ?: return
    onDecline?.invoke(id)
  }

  companion object {
    const val EXTRA_CALL_ID = "boa.callId"
    const val ACTION_HANG_UP = "expo.modules.boacall.HANG_UP"
    // Set while the module (and so JS) is alive.
    @Volatile var onDecline: ((String) -> Unit)? = null
    @Volatile var onHangUp: (() -> Unit)? = null
  }
}
