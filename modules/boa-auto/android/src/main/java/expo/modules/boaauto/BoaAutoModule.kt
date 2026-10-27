package expo.modules.boaauto

import android.content.Context
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The bridge between the app and the car (see BoaAutoService). JS sends
 * the station catalogue and what's playing; the car's taps come back as
 * "onCommand" events for src/audio/car.js to play through the app's engine.
 */
class BoaAutoModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "No React context" }
  private val main = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("BoaAuto")

    Events("onCommand")

    OnStartObserving("onCommand") {
      BoaAutoBridge.attach { command -> sendEvent("onCommand", command) }
    }

    OnStopObserving("onCommand") {
      BoaAutoBridge.detach()
    }

    // { folders: [{ id, title, stations: [{ id, name, subtitle, logo }] }] }
    Function("setCatalogue") { json: String ->
      BoaAutoStore.setCatalogue(context, json)
      main.post { BoaAutoService.current?.onCatalogue() }
    }

    // status: idle, loading, playing, paused, ended or error. artwork is the
    // station's logo (https) or its rendered record (file://). favourite
    // and hyped are null when the car shouldn't offer the heart or the fire.
    Function("setPlayback") { status: String, mediaId: String?, title: String?, artist: String?, artwork: String?, canStep: Boolean, favourite: Boolean?, hyped: Boolean? ->
      BoaAutoStore.setPlayback(context, AutoPlayback(status, mediaId, title, artist, artwork, canStep, favourite, hyped))
      main.post { BoaAutoService.current?.refresh() }
    }
  }
}
