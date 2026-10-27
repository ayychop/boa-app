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
 * image. Bass Boost (boost) takes the lows past the usual limits (BassBoost
 * at full strength, the bass bands up to MAX_BOOST_MILLIBELS) and raises
 * the whole volume ceiling with LoudnessEnhancer, whose limiter keeps the
 * louder signal from clipping. A phone that lacks an effect simply goes
 * without it.
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
          val range = eq.bandLevelRange // millibels, e.g. [-1500, 1500]
          val up = min(range[1].toInt(), MAX_MILLIBELS)
          val bassUp = min(range[1].toInt(), if (boost) MAX_BOOST_MILLIBELS else MAX_MILLIBELS)
          val cut = min(-range[0].toInt(), MAX_MILLIBELS)
          for (b in 0 until eq.numberOfBands.toInt()) {
            val band = b.toShort()
            val hz = eq.getCenterFreq(band) / 1000.0
            val low = lows * bassWeight(hz)
            val high = treble * trebleWeight(hz)
            val level = (if (low >= 0) low * bassUp else low * cut) + (if (high >= 0) high * up else high * cut)
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
          // 600 of 1000 at most from the slider; Bass Boost goes all the way.
          bb.setStrength((if (boost) 1000 else (lows * 600).roundToInt()).toShort())
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
        if (boost) {
          l.setTargetGain(BOOST_GAIN_MILLIBELS)
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
    // At most +/-12 dB, however much more the phone allows.
    private const val MAX_MILLIBELS = 1200
    // Bass Boost: the bass bands up to +15 dB, at least 85% of the way there,
    // and the volume ceiling raised 8 dB (LoudnessEnhancer's limiter holds
    // the peaks). Loud, but short of the point where phone speakers distort.
    private const val MAX_BOOST_MILLIBELS = 1500
    private const val BOOST_BASS = 0.85
    private const val BOOST_GAIN_MILLIBELS = 800
  }
}
