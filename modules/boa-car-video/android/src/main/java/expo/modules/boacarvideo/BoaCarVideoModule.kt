package expo.modules.boacarvideo

import android.content.Context
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * BOA Originals on the car's screen, parked only (Android Automotive OS).
 * JS asks whether this is a car and whether it's parked, hears every
 * change (onParkedChange), and opens a video: a file or stream in the
 * parked-only player (CarVideoActivity), or a YouTube video in the car's
 * YouTube app, which the car holds to the same parked rule.
 */
class BoaCarVideoModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "No React context" }

  private var stopWatching: (() -> Unit)? = null

  private fun stateMap(s: ParkedMonitor.State) = mapOf("parked" to s.parked, "reason" to s.reason)

  override fun definition() = ModuleDefinition {
    Name("BoaCarVideo")

    Events("onParkedChange")

    // Watching the car only while JS listens.
    OnStartObserving {
      stopWatching?.invoke()
      stopWatching = ParkedMonitor.listen(context) { s -> sendEvent("onParkedChange", stateMap(s)) }
    }

    OnStopObserving {
      stopWatching?.invoke()
      stopWatching = null
    }

    OnDestroy {
      stopWatching?.invoke()
      stopWatching = null
    }

    /** Whether this is a car running Android Automotive OS. */
    Function("isAutomotive") {
      ParkedMonitor.isAutomotive(context)
    }

    /** The latest { parked, reason } (parked false until the car has said so). */
    Function("getParked") {
      stateMap(ParkedMonitor.state)
    }

    /** Plays a video file or stream in the parked-only player. False (and nothing opens) unless parked. */
    AsyncFunction("playVideo") { url: String, title: String ->
      if (!ParkedMonitor.isAutomotive(context) || !ParkedMonitor.state.parked) return@AsyncFunction false
      context.startActivity(CarVideoActivity.intent(context, url, title))
      true
    }.runOnQueue(Queues.MAIN)

    /** Opens a YouTube video in the car's YouTube app. False if not parked or there's no YouTube app. */
    AsyncFunction("openYouTube") { videoId: String ->
      if (!ParkedMonitor.isAutomotive(context) || !ParkedMonitor.state.parked) return@AsyncFunction false
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse("vnd.youtube:$videoId"))
        .setPackage(YOUTUBE_PACKAGE)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      if (intent.resolveActivity(context.packageManager) == null) return@AsyncFunction false
      context.startActivity(intent)
      true
    }.runOnQueue(Queues.MAIN)
  }

  companion object {
    // YouTube for cars (Android Automotive OS) uses the same package as phones.
    private const val YOUTUBE_PACKAGE = "com.google.android.youtube"
  }
}
