package expo.modules.boascreen

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The screen turning off (power button, lock, screen timeout) or on, and
 * the phone being unlocked. React Native's AppState can't tell locking the
 * phone from switching to another app (both are just "background"); these
 * system broadcasts can. Only registered while JS is listening.
 */
class BoaScreenModule : Module() {
  private var receiver: BroadcastReceiver? = null

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "No React context" }

  override fun definition() = ModuleDefinition {
    Name("BoaScreen")

    Events("onScreenChange")

    OnStartObserving {
      if (receiver != null) return@OnStartObserving
      val r = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
          val state = when (intent.action) {
            Intent.ACTION_SCREEN_OFF -> "off"
            Intent.ACTION_SCREEN_ON -> "on"
            Intent.ACTION_USER_PRESENT -> "unlocked"
            else -> return
          }
          sendEvent("onScreenChange", mapOf("state" to state))
        }
      }
      val filter = IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_OFF)
        addAction(Intent.ACTION_SCREEN_ON)
        addAction(Intent.ACTION_USER_PRESENT)
      }
      // System broadcasts still reach a not-exported receiver.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        context.registerReceiver(r, filter)
      }
      receiver = r
    }

    OnStopObserving {
      receiver?.let { runCatching { context.unregisterReceiver(it) } }
      receiver = null
    }
  }
}
