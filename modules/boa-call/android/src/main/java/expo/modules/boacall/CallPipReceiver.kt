package expo.modules.boacall

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * The Mute and End buttons on the picture-in-picture call window. Android
 * draws them from the RemoteActions on the PiP params (CallPip); a tap sends
 * one of these broadcasts, which reaches JS (BoaCallModule: onPipAction),
 * which mutes the call or ends it. Without JS running there is nothing live
 * to act on, so it is simply ignored.
 */
class CallPipReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      ACTION_PIP_MUTE -> onAction?.invoke("mute")
      ACTION_PIP_END -> onAction?.invoke("end")
    }
  }

  companion object {
    const val ACTION_PIP_MUTE = "expo.modules.boacall.PIP_MUTE"
    const val ACTION_PIP_END = "expo.modules.boacall.PIP_END"
    // Set while the module (and so JS) is alive.
    @Volatile var onAction: ((String) -> Unit)? = null
  }
}
