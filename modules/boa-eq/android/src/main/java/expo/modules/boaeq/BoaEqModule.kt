package expo.modules.boaeq

import android.media.audiofx.BassBoost
import android.media.audiofx.DynamicsProcessing
import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import android.media.audiofx.Virtualizer
import android.os.Build
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * BOA Hi-Fi: bass, treble, spatial sound and Bass Boost on the radio player. Android's
 * own audio effects, attached to the player's audio session (expo-audio
 * exposes it as `audioSessionId`, see patches/expo-audio), so only BOA's
 * sound changes, not other apps'.
 *
 * Bass and treble run from -1 to 1, around the BOA Signature sound at 0:
 *  - 0 is what used to be the very top of both sliders: the Equalizer's
 *    bass and treble bands at the phone codec's ceiling, BassBoost at full
 *    strength and LoudnessEnhancer lifting the volume.
 *  - -1 is truly flat: every effect off.
 *  - Above 0 goes past the Equalizer's hardware ceiling: DynamicsProcessing
 *    (Android 9+) adds up to EXTRA_BASS_DB and EXTRA_TREBLE_DB on top in
 *    float, with its own limiter, and LoudnessEnhancer lifts the volume
 *    further. A phone without DynamicsProcessing still gets the louder
 *    ceiling.
 * Bass Boost holds the lows at least BOOST_BASS up and raises the ceiling
 * to BOOST_GAIN_MILLIBELS, party volume. LoudnessEnhancer is created last,
 * so its limiter sits at the end of the chain and catches every peak. A
 * phone that lacks an effect simply goes without it.
 */
class BoaEqModule : Module() {
  private var session = 0
  private var equalizer: Equalizer? = null
  private var dynamics: DynamicsProcessing? = null
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
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) dynamics = make("dynamics processing") { dynamicsFor(sessionId) }
      bassBoost = make("bass boost") { BassBoost(0, sessionId) }
      virtualizer = make("virtualizer") { Virtualizer(0, sessionId) }
      loudness = make("loudness enhancer") { LoudnessEnhancer(sessionId) }
    }
    // Bass Boost's lows: the slider's bass, never less than BOOST_BASS.
    val lows = if (boost) max(bass, BOOST_BASS) else bass
    val flat = lows <= -1.0 && treble <= -1.0
    // How far each slider sits from flat to Signature (0 to 1), and past Signature (0 to 1).
    val lowsUpTo = 1 + min(lows, 0.0)
    val highsUpTo = 1 + min(treble, 0.0)
    val lowsPast = max(lows, 0.0)
    val highsPast = max(treble, 0.0)
    var shaping = false

    equalizer?.let { eq ->
      try {
        if (flat) {
          eq.setEnabled(false)
        } else {
          // The phone's whole range, e.g. [-1500, 1500] millibels: Signature is its ceiling.
          val range = eq.bandLevelRange
          val up = min(range[1].toInt(), MAX_MILLIBELS)
          for (b in 0 until eq.numberOfBands.toInt()) {
            val band = b.toShort()
            val hz = eq.getCenterFreq(band) / 1000.0
            val level = (lowsUpTo * bassWeight(hz) + highsUpTo * trebleWeight(hz)) * up
            eq.setBandLevel(band, level.roundToInt().coerceIn(range[0].toInt(), range[1].toInt()).toShort())
          }
          eq.setEnabled(true)
          shaping = true
        }
      } catch (e: Exception) {
        Log.w(TAG, "equalizer: ${e.message}")
      }
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      dynamics?.let { dp ->
        try {
          if (lowsPast <= 0 && highsPast <= 0) {
            dp.setEnabled(false)
          } else {
            val extraLows = lowsPast * EXTRA_BASS_DB
            val extraHighs = highsPast * EXTRA_TREBLE_DB
            PRE_EQ_CUTOFFS.forEachIndexed { i, cutoff ->
              val hz = bandCentre(i)
              val gain = (extraLows * bassWeight(hz) + extraHighs * trebleWeight(hz)).toFloat()
              dp.setPreEqBandAllChannelsTo(i, DynamicsProcessing.EqBand(true, cutoff, gain))
            }
            // Room for the extra before the limiter, so it grows the bass
            // and air rather than pumping everything else; LoudnessEnhancer
            // makes the level back up at the end of the chain.
            dp.setInputGainAllChannelsTo(-(max(extraLows, extraHighs) * HEADROOM_SHARE).toFloat())
            dp.setEnabled(true)
            shaping = true
          }
        } catch (e: Exception) {
          Log.w(TAG, "dynamics processing: ${e.message}")
        }
      }
    }

    bassBoost?.let { bb ->
      try {
        if (lowsUpTo > 0 && bb.strengthSupported) {
          // Full strength (1000) from Signature up; fading to off at flat.
          bb.setStrength((lowsUpTo * 1000).roundToInt().coerceIn(0, 1000).toShort())
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
        // once the limiter tames it: up to SIGNATURE_GAIN at Signature, then
        // on to MAX_SLIDER_GAIN at the top.
        val up = max(lowsUpTo, highsUpTo)
        val past = max(lowsPast, highsPast)
        val gain = if (boost) BOOST_GAIN_MILLIBELS else (up * SIGNATURE_GAIN_MILLIBELS + past * (MAX_SLIDER_GAIN_MILLIBELS - SIGNATURE_GAIN_MILLIBELS)).roundToInt()
        if (gain > 0) {
          l.setTargetGain(gain)
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

  // The extra stage: a float pre-EQ (past the Equalizer's hardware range)
  // and a brick-wall limiter just under full scale, so nothing it adds clips.
  @android.annotation.TargetApi(Build.VERSION_CODES.P)
  private fun dynamicsFor(sessionId: Int): DynamicsProcessing {
    val config = DynamicsProcessing.Config.Builder(
      DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION,
      CHANNELS,
      true,
      PRE_EQ_CUTOFFS.size,
      false,
      0,
      false,
      0,
      true,
    ).build()
    return DynamicsProcessing(0, sessionId, config).apply {
      setLimiterAllChannelsTo(DynamicsProcessing.Limiter(true, true, 0, LIMITER_ATTACK_MS, LIMITER_RELEASE_MS, LIMITER_RATIO, LIMITER_THRESHOLD_DB, 0f))
      setEnabled(false)
    }
  }

  // A pre-EQ band runs from the previous cutoff to its own: its middle, on a log scale.
  private fun bandCentre(i: Int): Double {
    val lo = if (i == 0) 20.0 else PRE_EQ_CUTOFFS[i - 1].toDouble()
    return sqrt(lo * PRE_EQ_CUTOFFS[i])
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
    listOf(equalizer, dynamics, bassBoost, virtualizer, loudness).forEach {
      try {
        it?.release()
      } catch (_: Exception) {
      }
    }
    equalizer = null
    dynamics = null
    bassBoost = null
    virtualizer = null
    loudness = null
    session = 0
  }

  companion object {
    private const val TAG = "BoaEq"
    // Up to +/-24 dB asked for; the phone's own range (usually +/-15 dB) caps
    // it, so Signature runs every phone to its codec's real limit.
    private const val MAX_MILLIBELS = 2400
    // Past Signature, at the top of the sliders: this much more bass and
    // treble, on top of the Equalizer's ceiling (DynamicsProcessing).
    const val EXTRA_BASS_DB = 12.0
    const val EXTRA_TREBLE_DB = 6.0
    // Half of the extra is made room for before the limiter.
    private const val HEADROOM_SHARE = 0.5
    private const val CHANNELS = 2
    // The pre-EQ's bands, by their top frequency in Hz.
    private val PRE_EQ_CUTOFFS = floatArrayOf(60f, 120f, 250f, 500f, 1500f, 4000f, 8000f, 20000f)
    // The limiter: fast enough to catch a kick drum, slow enough not to distort it.
    private const val LIMITER_ATTACK_MS = 1f
    private const val LIMITER_RELEASE_MS = 60f
    private const val LIMITER_RATIO = 10f
    private const val LIMITER_THRESHOLD_DB = -1f
    // Bass Boost: the lows at least halfway past Signature, and the volume
    // ceiling raised 18 dB. LoudnessEnhancer's limiter holds the peaks.
    private const val BOOST_BASS = 0.5
    const val BOOST_GAIN_MILLIBELS = 1800
    // The sliders lift the volume 6 dB at Signature (the old maximum), and
    // up to 14 dB at the top.
    const val SIGNATURE_GAIN_MILLIBELS = 600
    const val MAX_SLIDER_GAIN_MILLIBELS = 1400
  }
}
