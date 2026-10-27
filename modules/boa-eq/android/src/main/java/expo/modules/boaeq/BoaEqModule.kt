package expo.modules.boaeq

import android.media.audiofx.BassBoost
import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import android.media.audiofx.Virtualizer
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * BOA Hi-Fi: bass, treble, spatial sound and Bass Boost on the radio player. Android's
 * own audio effects, attached to the player's audio session (expo-audio
 * exposes it as `audioSessionId`, see patches/expo-audio), so only BOA's
 * sound changes, not other apps'.
 *
 * Bass and treble run from -1 (cut) to 1 (boost); spatial widens the stereo
 * image. Every slider runs to the full range the phone's codec reports: at
 * full bass the bass bands sit at the Equalizer's ceiling and BassBoost at
 * full strength. Any boost also lifts the volume with LoudnessEnhancer,
 * created last so it sits at the end of the chain and its limiter catches
 * the peaks the boosted bands push over 0 dBFS. Bass Boost (boost) holds
 * the lows near the top and raises the ceiling by BOOST_GAIN_MILLIBELS,
 * party volume. A phone that lacks an effect simply goes without it.
 */
class BoaEqModule : Module() {
  private var session = 0
  private var equalizer: Equalizer? = null
  private var bassBoost: BassBoost? = null
  private var virtualizer: Virtualizer? = null
  private var loudness: LoudnessEnhancer? = null

  override fun definition() = ModuleDefinition {
    Name("BoaEq")

    // Returns whether any effect is now shaping the sound.
    Function("apply") { sessionId: Int, bass: Double, treble: Double, spatial: Boolean, boost: Boolean ->
      applyTo(sessionId, bass.coerceIn(-1.0, 1.0), treble.coerceIn(-1.0, 1.0), spatial, boost)
    }

    Function("release") {
      releaseAll()
    }

    OnDestroy {
      releaseAll()
    }
  }

  private fun applyTo(sessionId: Int, bass: Double, treble: Double, spatial: Boolean, boost: Boolean): Boolean {
    if (sessionId <= 0) return false
    if (sessionId != session) {
      releaseAll()
      session = sessionId
      equalizer = make("equalizer") { Equalizer(0, sessionId) }
      bassBoost = make("bass boost") { BassBoost(0, sessionId) }
      virtualizer = make("virtualizer") { Virtualizer(0, sessionId) }
      loudness = make("loudness enhancer") { LoudnessEnhancer(sessionId) }
    }
    val flat = bass == 0.0 && treble == 0.0 && !boost
    // Bass Boost's lows: the slider's bass, never less than BOOST_BASS.
    val lows = if (boost) maxOf(bass, BOOST_BASS) else bass
    var shaping = false

    equalizer?.let { eq ->
      try {
        if (flat) {
          eq.setEnabled(false)
        } else {
          // The phone's whole range, e.g. [-1500, 1500] millibels.
          val range = eq.bandLevelRange
          val up = min(range[1].toInt(), MAX_MILLIBELS)
          val cut = min(-range[0].toInt(), MAX_MILLIBELS)
          for (b in 0 until eq.numberOfBands.toInt()) {
            val band = b.toShort()
            val hz = eq.getCenterFreq(band) / 1000.0
            val low = lows * bassWeight(hz)
            val high = treble * trebleWeight(hz)
            val level = (if (low >= 0) low * up else low * cut) + (if (high >= 0) high * up else high * cut)
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
        if (lows > 0 && bb.strengthSupported) {
          // The slider runs the full 0 to 1000; Bass Boost is always 1000.
          bb.setStrength((if (boost) 1000 else (lows * 1000).roundToInt()).toShort())
          bb.setEnabled(true)
          shaping = true
        } else {
          bb.setEnabled(false)
        }
      } catch (e: Exception) {
        Log.w(TAG, "bass boost: ${e.message}")
      }
    }

    loudness?.let { l ->
      try {
        // Louder as either slider goes up, so a boost never sounds quieter
        // once the limiter tames it.
        val lift = maxOf(lows, treble, 0.0)
        if (boost) {
          l.setTargetGain(BOOST_GAIN_MILLIBELS)
          l.setEnabled(true)
          shaping = true
        } else if (lift > 0) {
          l.setTargetGain((lift * SLIDER_GAIN_MILLIBELS).roundToInt())
          l.setEnabled(true)
          shaping = true
        } else {
          l.setEnabled(false)
        }
      } catch (e: Exception) {
        Log.w(TAG, "loudness enhancer: ${e.message}")
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

  // Full weight up to 250 Hz (sub and punch), fading out by 600 Hz.
  private fun bassWeight(hz: Double) = when {
    hz <= 250 -> 1.0
    hz >= 600 -> 0.0
    else -> (600 - hz) / 350
  }

  // Nothing below 1.5 kHz, full weight from 5 kHz (presence and air).
  private fun trebleWeight(hz: Double) = when {
    hz >= 5000 -> 1.0
    hz <= 1500 -> 0.0
    else -> (hz - 1500) / 3500
  }

  private fun <T> make(what: String, create: () -> T): T? =
    try {
      create()
    } catch (e: Exception) {
      Log.w(TAG, "no $what on this phone: ${e.message}")
      null
    }

  private fun releaseAll() {
    listOf(equalizer, bassBoost, virtualizer, loudness).forEach {
      try {
        it?.release()
      } catch (_: Exception) {
      }
    }
    equalizer = null
    bassBoost = null
    virtualizer = null
    loudness = null
    session = 0
  }

  companion object {
    private const val TAG = "BoaEq"
    // Up to +/-24 dB asked for; the phone's own range (usually +/-15 dB) caps
    // it, so every phone runs to its codec's real limit.
    private const val MAX_MILLIBELS = 2400
    // Bass Boost: the lows at least 90% of the way up, and the volume ceiling
    // raised 12 dB. LoudnessEnhancer's limiter holds the peaks, so it gets
    // loud rather than crackly; past this the limiter pumps audibly.
    private const val BOOST_BASS = 0.9
    private const val BOOST_GAIN_MILLIBELS = 1200
    // The sliders alone lift the volume up to 6 dB at full boost.
    private const val SLIDER_GAIN_MILLIBELS = 600
  }
}
