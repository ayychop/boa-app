package expo.modules.boacall

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * The Mute, Chat and End buttons on the picture-in-picture call window. Android
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
      ACTION_PIP_CHAT -> {
        // Bring the app out of its floating window first (the window being on
        // screen is what lets Android allow this), then tell JS to open the chat.
        runCatching {
          context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
            it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            context.startActivity(it)
          }
        }
        onAction?.invoke("chat")
      }
    }
  }

  companion object {
    const val ACTION_PIP_MUTE = "expo.modules.boacall.PIP_MUTE"
    const val ACTION_PIP_END = "expo.modules.boacall.PIP_END"
    const val ACTION_PIP_CHAT = "expo.modules.boacall.PIP_CHAT"
    // Set while the module (and so JS) is alive.
    @Volatile var onAction: ((String) -> Unit)? = null
  }
}
