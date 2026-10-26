package expo.modules.boaeq

import android.media.audiofx.BassBoost
import android.media.audiofx.Equalizer
import android.media.audiofx.Virtualizer
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * BOA Hi-Fi: bass, treble and spatial sound on the radio player. Android's
 * own audio effects, attached to the player's audio session (expo-audio
 * exposes it as `audioSessionId`, see patches/expo-audio), so only BOA's
 * sound changes, not other apps'.
 *
 * Bass and treble run from -1 (cut) to 1 (boost); spatial widens the stereo
 * image. A phone that lacks an effect simply goes without it.
 */
class BoaEqModule : Module() {
  private var session = 0
  private var equalizer: Equalizer? = null
  private var bassBoost: BassBoost? = null
  private var virtualizer: Virtualizer? = null

  override fun definition() = ModuleDefinition {
    Name("BoaEq")

    // Returns whether any effect is now shaping the sound.
    Function("apply") { sessionId: Int, bass: Double, treble: Double, spatial: Boolean ->
      applyTo(sessionId, bass.coerceIn(-1.0, 1.0), treble.coerceIn(-1.0, 1.0), spatial)
    }

    Function("release") {
      releaseAll()
    }

    OnDestroy {
      releaseAll()
    }
  }

  private fun applyTo(sessionId: Int, bass: Double, treble: Double, spatial: Boolean): Boolean {
    if (sessionId <= 0) return false
    if (sessionId != session) {
      releaseAll()
      session = sessionId
      equalizer = make("equalizer") { Equalizer(0, sessionId) }
      bassBoost = make("bass boost") { BassBoost(0, sessionId) }
      virtualizer = make("virtualizer") { Virtualizer(0, sessionId) }
    }
    val flat = bass == 0.0 && treble == 0.0
    var shaping = false

    equalizer?.let { eq ->
      try {
        if (flat) {
          eq.setEnabled(false)
        } else {
          val range = eq.bandLevelRange // millibels, e.g. [-1500, 1500]
          val boost = min(range[1].toInt(), MAX_MILLIBELS)
          val cut = min(-range[0].toInt(), MAX_MILLIBELS)
          for (b in 0 until eq.numberOfBands.toInt()) {
            val band = b.toShort()
            val hz = eq.getCenterFreq(band) / 1000.0
            val gain = bass * bassWeight(hz) + treble * trebleWeight(hz)
            val level = if (gain >= 0) gain * boost else gain * cut
            eq.setBandLevel(band, level.roundToInt().coerceIn(range[0].toInt(), range[1].toInt()).toShort())
          }
          eq.setEnabled(true)
          shaping = true
        }
      } catch (e: Exception) {
        Log.w(TAG, "equalizer: ${e.message}")
      }
    }

    bassBoost?.let { bb ->
      try {
        if (bass > 0 && bb.strengthSupported) {
          bb.setStrength((bass * 600).roundToInt().toShort())
          bb.setEnabled(true)
          shaping = true
        } else {
          bb.setEnabled(false)
        }
      } catch (e: Exception) {
        Log.w(TAG, "bass boost: ${e.message}")
      }
    }

    virtualizer?.let { v ->
      try {
        if (spatial) {
          if (v.strengthSupported) v.setStrength(1000)
          v.setEnabled(true)
          shaping = true
        } else {
          v.setEnabled(false)
        }
      } catch (e: Exception) {
        Log.w(TAG, "virtualizer: ${e.message}")
      }
    }
    return shaping
  }

  // Full weight up to 150 Hz, fading out by 500 Hz.
  private fun bassWeight(hz: Double) = when {
    hz <= 150 -> 1.0
    hz >= 500 -> 0.0
    else -> (500 - hz) / 350
  }

  // Nothing below 2 kHz, full weight from 6 kHz.
  private fun trebleWeight(hz: Double) = when {
    hz >= 6000 -> 1.0
    hz <= 2000 -> 0.0
    else -> (hz - 2000) / 4000
  }

  private fun <T> make(what: String, create: () -> T): T? =
    try {
      create()
    } catch (e: Exception) {
      Log.w(TAG, "no $what on this phone: ${e.message}")
      null
    }

  private fun releaseAll() {
    listOf(equalizer, bassBoost, virtualizer).forEach {
      try {
        it?.release()
      } catch (_: Exception) {
      }
    }
    equalizer = null
    bassBoost = null
    virtualizer = null
    session = 0
  }

  companion object {
    private const val TAG = "BoaEq"
    // At most +/-12 dB, however much more the phone allows.
    private const val MAX_MILLIBELS = 1200
  }
}
