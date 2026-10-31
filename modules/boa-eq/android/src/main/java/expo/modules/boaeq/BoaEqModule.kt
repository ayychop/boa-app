package expo.modules.boaeq

import android.app.UiModeManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Configuration
import android.database.ContentObserver
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.audiofx.BassBoost
import android.media.audiofx.DynamicsProcessing
import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import android.media.audiofx.Virtualizer
import android.os.Build
import android.os.Bundle
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * BOA Hi-Fi: bass, treble, loudness, clear vocals, spatial sound and Bass Boost on the radio
 * player. Android's own audio effects, attached to the player's audio session (expo-audio
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
 * Loudness (0 to 1) lifts the volume by up to LOUDNESS_SLIDER_MILLIBELS more,
 * whatever the other sliders say. Clear Vocals (0 to 1) lifts the voice's
 * presence (about 1 to 6 kHz, by up to VOCAL_DB) and clears the mud under it
 * (about 200 to 400 Hz) so a voice cuts through a car or a crowded room.
 * Bass Boost holds the lows at least BOOST_BASS up and raises the ceiling
 * to BOOST_GAIN_MILLIBELS, party volume. LoudnessEnhancer is created last,
 * so its limiter sits at the end of the chain and catches every peak. A
 * phone that lacks an effect simply goes without it.
 *
 * Where the sound is going changes how it is shaped (see [Profile]):
 *  - a car (Android Auto projecting, or the phone in car mode), or
 *  - Bluetooth (A2DP, LE Audio, hearing aids: headphones, speakers and
 *    car stereos alike; Android can't tell which from the output alone).
 * Both lose bass and treble on the way (a cabin swallows the lows; the
 * Bluetooth codecs round off the top and bottom), so on either one the same
 * sliders sound bigger: extra bass and treble past Signature (the sub-bass
 * weighted up), the lows and highs held at least `minPast` past Signature
 * unless the sliders are flat, the volume ceiling raised to at least the Bass
 * Boost ceiling plus the route's own extra, Bass Boost at full strength and
 * the Virtualizer widening the stage. The Equalizer itself can't go past the
 * phone's own hardware range, so the extra is DynamicsProcessing and
 * LoudnessEnhancer (its limiter still catches every peak). The effects follow
 * the route: a car or a Bluetooth device connecting or leaving re-applies the
 * last settings by itself, and tells JS which route it now is. The Bluetooth
 * boost (car and Bluetooth both) can be switched off (`link`); Flat is always flat.
 */
class BoaEqModule : Module() {
  private var session = 0
  private var equalizer: Equalizer? = null
  private var dynamics: DynamicsProcessing? = null
  private var bassBoost: BassBoost? = null
  private var virtualizer: Virtualizer? = null
  private var loudness: LoudnessEnhancer? = null
  // bass, treble, spatial (0/1), boost (0/1), loudness, vocals, link (0/1)
  private var last: DoubleArray? = null
  private var carWatch: ContentObserver? = null
  private var carReceiver: BroadcastReceiver? = null
  private var deviceWatch: AudioDeviceCallback? = null
  private var lastRoute: String? = null

  /** How one kind of output is shaped, on top of the sliders. */
  private class Profile(
    val extraBassDb: Double,
    val extraTrebleDb: Double,
    val subWeight: Double,
    val minPast: Double,
    val extraGainMillibels: Int,
    // Whether the sound is maxed out: Bass Boost at full strength, the volume
    // ceiling at least BOOST_GAIN_MILLIBELS, the Virtualizer on.
    val maxed: Boolean,
  )

  override fun definition() = ModuleDefinition {
    Name("BoaEq")

    Events("onRouteChange")

    // Returns whether any effect is now shaping the sound.
    Function("apply") { sessionId: Int, bass: Double, treble: Double, spatial: Boolean, boost: Boolean, loudnessAmount: Double, vocals: Double, link: Boolean ->
      val b = bass.coerceIn(-1.0, 1.0)
      val t = treble.coerceIn(-1.0, 1.0)
      val l = loudnessAmount.coerceIn(0.0, 1.0)
      val v = vocals.coerceIn(0.0, 1.0)
      last = doubleArrayOf(b, t, if (spatial) 1.0 else 0.0, if (boost) 1.0 else 0.0, l, v, if (link) 1.0 else 0.0)
      applyTo(sessionId, b, t, spatial, boost, l, v, link)
    }

    Function("release") {
      releaseAll()
    }

    /** Whether the phone is projecting to a car (Android Auto) or in car mode right now. */
    Function("isCar") {
      inCar()
    }

    /** Where the sound is going: "car", "bluetooth", "wired" or "speaker". */
    Function("route") {
      routeName()
    }

    OnCreate {
      watchRoute()
    }

    OnDestroy {
      unwatchRoute()
      releaseAll()
    }
  }

  // ---- where the sound is going

  private val ctx: Context?
    get() = appContext.reactContext

  // Android Auto's own connection state (what androidx CarConnection reads):
  // 0 not connected, 1 a car's built-in Android (Automotive), 2 projecting.
  private fun projecting(c: Context): Boolean =
    try {
      c.contentResolver.query(CAR_URI, arrayOf(CAR_STATE), null, null, null)?.use { cur ->
        if (!cur.moveToFirst()) return@use false
        val i = cur.getColumnIndex(CAR_STATE)
        i >= 0 && cur.getInt(i) >= 1
      } ?: false
    } catch (_: Exception) {
      false
    }

  private fun carMode(c: Context): Boolean =
    (c.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager)?.currentModeType == Configuration.UI_MODE_TYPE_CAR

  private fun inCar(): Boolean {
    val c = ctx ?: return false
    return projecting(c) || carMode(c)
  }

  private fun isBluetooth(type: Int): Boolean = type in BLUETOOTH_TYPES

  private fun isWired(type: Int): Boolean = type in WIRED_TYPES

  // The outputs media is going to. On Android 13+ that is the real route (a
  // Bluetooth device that is connected but not in use doesn't count); before
  // it, every connected output.
  private fun outputs(c: Context): List<AudioDeviceInfo> {
    val am = c.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return emptyList()
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        val attrs = AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
          .build()
        am.getAudioDevicesForAttributes(attrs)
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).toList()
      } else {
        emptyList()
      }
    } catch (_: Exception) {
      emptyList()
    }
  }

  private fun bluetoothOut(c: Context): Boolean = outputs(c).any { isBluetooth(it.type) }

  private fun wiredOut(c: Context): Boolean = outputs(c).any { isWired(it.type) }

  private fun routeName(): String {
    val c = ctx ?: return "speaker"
    return when {
      inCar() -> "car"
      bluetoothOut(c) -> "bluetooth"
      wiredOut(c) -> "wired"
      else -> "speaker"
    }
  }

  // The car connecting or leaving, or a Bluetooth device (dis)connecting,
  // re-applies the last settings with the new route's sound, without JS
  // having to know, and tells JS which route it now is.
  private fun reapply() {
    val l = last ?: return
    if (session <= 0) return
    try {
      applyTo(session, l[0], l[1], l[2] > 0, l[3] > 0, l[4], l[5], l[6] > 0)
    } catch (e: Exception) {
      Log.w(TAG, "re-apply: ${e.message}")
    }
  }

  private fun routeChanged() {
    reapply()
    try {
      val now = routeName()
      if (now != lastRoute) {
        lastRoute = now
        sendEvent("onRouteChange", Bundle().apply { putString("route", now) })
      }
    } catch (e: Exception) {
      Log.w(TAG, "route event: ${e.message}")
    }
  }

  private fun watchRoute() {
    val c = ctx ?: return
    if (carWatch != null || deviceWatch != null) return
    val main = Handler(Looper.getMainLooper())
    val observer = object : ContentObserver(main) {
      override fun onChange(selfChange: Boolean) = routeChanged()
    }
    try {
      c.contentResolver.registerContentObserver(CAR_URI, false, observer)
      carWatch = observer
    } catch (_: Exception) {
      // Android Auto isn't installed or won't say: car mode below still works.
    }
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) = routeChanged()
    }
    val filter = IntentFilter().apply {
      addAction(UiModeManager.ACTION_ENTER_CAR_MODE)
      addAction(UiModeManager.ACTION_EXIT_CAR_MODE)
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) c.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      else c.registerReceiver(receiver, filter)
      carReceiver = receiver
    } catch (_: Exception) {
    }
    // Bluetooth (and any other output) connecting or leaving.
    try {
      val am = c.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
      if (am != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        val callback = object : AudioDeviceCallback() {
          override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) = routeChanged()
          override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) = routeChanged()
        }
        am.registerAudioDeviceCallback(callback, main)
        deviceWatch = callback
      }
    } catch (e: Exception) {
      Log.w(TAG, "no output watch on this phone: ${e.message}")
    }
  }

  private fun unwatchRoute() {
    val c = ctx
    carWatch?.let { o -> try { c?.contentResolver?.unregisterContentObserver(o) } catch (_: Exception) {} }
    carReceiver?.let { r -> try { c?.unregisterReceiver(r) } catch (_: Exception) {} }
    deviceWatch?.let { d ->
      try {
        (c?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager)?.unregisterAudioDeviceCallback(d)
      } catch (_: Exception) {
      }
    }
    carWatch = null
    carReceiver = null
    deviceWatch = null
  }

  // ---- the effects

  @Synchronized
  private fun applyTo(
    sessionId: Int,
    bass: Double,
    treble: Double,
    spatial: Boolean,
    boost: Boolean,
    loudnessSlider: Double,
    vocals: Double,
    link: Boolean,
  ): Boolean {
    if (sessionId <= 0) return false
    val c = ctx
    // A car or Bluetooth is boosted unless that has been switched off (`link`).
    val car = link && inCar()
    val wireless = !car && link && c != null && bluetoothOut(c)
    val profile = when {
      car -> CAR
      wireless -> BLUETOOTH
      else -> PHONE
    }
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
    // Nothing asked for at all: every slider flat, no loudness, no voice.
    val silent = flat && vocals <= 0.0 && loudnessSlider <= 0.0
    // How far each slider sits from flat to Signature (0 to 1), and past Signature (0 to 1).
    val lowsUpTo = 1 + min(lows, 0.0)
    val highsUpTo = 1 + min(treble, 0.0)
    // On a car or Bluetooth the sliders count as at least minPast past
    // Signature (unless flat on that side), so even a phone-perfect setting
    // gets the extra bass and treble the route swallows.
    val lowsPast = if (profile.minPast > 0 && lows > -1.0) max(lows, profile.minPast) else max(lows, 0.0)
    val highsPast = if (profile.minPast > 0 && treble > -1.0) max(treble, profile.minPast) else max(treble, 0.0)
    var shaping = false

    equalizer?.let { eq ->
      try {
        if (flat && vocals <= 0.0) {
          eq.setEnabled(false)
        } else {
          // The phone's whole range, e.g. [-1500, 1500] millibels: Signature is its ceiling.
          val range = eq.bandLevelRange
          val up = min(range[1].toInt(), MAX_MILLIBELS)
          for (b in 0 until eq.numberOfBands.toInt()) {
            val band = b.toShort()
            val hz = eq.getCenterFreq(band) / 1000.0
            val level = (lowsUpTo * bassWeight(hz) + highsUpTo * trebleWeight(hz) + vocals * VOCAL_EQ_SHARE * vocalShape(hz)) * up
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
          if (lowsPast <= 0 && highsPast <= 0 && vocals <= 0.0) {
            dp.setEnabled(false)
          } else {
            val extraLows = lowsPast * (EXTRA_BASS_DB + profile.extraBassDb)
            val extraHighs = highsPast * (EXTRA_TREBLE_DB + profile.extraTrebleDb)
            val extraVoice = vocals * VOCAL_DB
            PRE_EQ_CUTOFFS.forEachIndexed { i, cutoff ->
              val hz = bandCentre(i)
              // The sub-bass (under 120 Hz) is what a cabin, or a Bluetooth codec, loses first.
              val sub = if (profile.subWeight > 1.0 && hz <= 120) profile.subWeight else 1.0
              val gain = (extraLows * bassWeight(hz) * sub + extraHighs * trebleWeight(hz) + extraVoice * vocalShape(hz)).toFloat()
              dp.setPreEqBandAllChannelsTo(i, DynamicsProcessing.EqBand(true, cutoff, gain))
            }
            // Room for the extra before the limiter, so it grows the bass
            // and air rather than pumping everything else; LoudnessEnhancer
            // makes the level back up at the end of the chain.
            dp.setInputGainAllChannelsTo(-(max(max(extraLows, extraHighs), extraVoice) * HEADROOM_SHARE).toFloat())
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
          // Full strength (1000) from Signature up (and always on a car or
          // Bluetooth); fading to off at flat.
          val strength = if (profile.maxed) 1000 else (lowsUpTo * 1000).roundToInt().coerceIn(0, 1000)
          bb.setStrength(strength.toShort())
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
        val sliders = (up * SIGNATURE_GAIN_MILLIBELS + past * (MAX_SLIDER_GAIN_MILLIBELS - SIGNATURE_GAIN_MILLIBELS)).roundToInt()
        var base = if (boost) BOOST_GAIN_MILLIBELS else sliders
        // On a car or Bluetooth the ceiling is maxed out (unless flat): at
        // least the Bass Boost ceiling, which the route's own extra then tops.
        if (profile.maxed && !flat) base = max(base, BOOST_GAIN_MILLIBELS)
        // Louder in the car or on Bluetooth: a moving cabin is noisy and a
        // codec is quiet. LoudnessEnhancer's limiter still holds the peaks.
        val routed = if (profile.extraGainMillibels > 0 && base > 0) base + profile.extraGainMillibels else base
        // The Loudness slider, on top of everything, even with the rest flat.
        val gain = routed + (loudnessSlider * LOUDNESS_SLIDER_MILLIBELS).roundToInt()
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
        // A car or Bluetooth gets the wraparound stage whether or not Spatial
        // is on; flat stays flat.
        if (spatial || (profile.maxed && !silent)) {
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

  // What Clear Vocals does at each frequency: the mud under a voice cleared a
  // little (negative), then the presence lifted most at 2.5 kHz, where
  // consonants live, and tapering to nothing by 12 kHz. Straight lines
  // between the points, on a log scale.
  private fun vocalShape(hz: Double): Double {
    if (hz <= VOCAL_HZ.first() || hz >= VOCAL_HZ.last()) return 0.0
    var i = 1
    while (i < VOCAL_HZ.size - 1 && hz > VOCAL_HZ[i]) i++
    val lo = VOCAL_HZ[i - 1]
    val hi = VOCAL_HZ[i]
    val t = (ln(hz) - ln(lo)) / (ln(hi) - ln(lo))
    return VOCAL_WEIGHT[i - 1] + (VOCAL_WEIGHT[i] - VOCAL_WEIGHT[i - 1]) * t
  }

  private fun <T> make(what: String, create: () -> T): T? =
    try {
      create()
    } catch (e: Exception) {
      Log.w(TAG, "no $what on this phone: ${e.message}")
      null
    }

  @Synchronized
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
    // The Loudness slider: up to this much more, on top of everything else.
    const val LOUDNESS_SLIDER_MILLIBELS = 1200
    // Clear Vocals: up to this much lift at the voice's presence (DynamicsProcessing),
    // and this share of the Equalizer's ceiling where a phone has no DynamicsProcessing.
    const val VOCAL_DB = 9.0
    private const val VOCAL_EQ_SHARE = 0.5
    private val VOCAL_HZ = doubleArrayOf(150.0, 300.0, 500.0, 1000.0, 2500.0, 4500.0, 8000.0, 12000.0)
    private val VOCAL_WEIGHT = doubleArrayOf(0.0, -0.35, 0.0, 0.6, 1.0, 0.8, 0.2, 0.0)

    // The car: more on top of all that (DynamicsProcessing and LoudnessEnhancer
    // only; the Equalizer is already at the phone's hardware ceiling).
    private const val CAR_MIN_PAST = 0.4
    const val CAR_EXTRA_BASS_DB = 6.0
    const val CAR_EXTRA_TREBLE_DB = 3.0
    private const val CAR_SUB_WEIGHT = 1.35
    const val CAR_EXTRA_GAIN_MILLIBELS = 500
    // Bluetooth: a codec rounds off the bottom and the top, so both are
    // lifted, a little less than a cabin's worth.
    private const val BT_MIN_PAST = 0.3
    const val BT_EXTRA_BASS_DB = 4.0
    const val BT_EXTRA_TREBLE_DB = 3.0
    private const val BT_SUB_WEIGHT = 1.25
    const val BT_EXTRA_GAIN_MILLIBELS = 400

    private val PHONE = Profile(0.0, 0.0, 1.0, 0.0, 0, false)
    private val CAR = Profile(CAR_EXTRA_BASS_DB, CAR_EXTRA_TREBLE_DB, CAR_SUB_WEIGHT, CAR_MIN_PAST, CAR_EXTRA_GAIN_MILLIBELS, true)
    private val BLUETOOTH = Profile(BT_EXTRA_BASS_DB, BT_EXTRA_TREBLE_DB, BT_SUB_WEIGHT, BT_MIN_PAST, BT_EXTRA_GAIN_MILLIBELS, true)

    // AudioDeviceInfo types: Bluetooth A2DP (8) and SCO (7), hearing aids
    // (23), and LE Audio's headset (26), speaker (27) and broadcast (30);
    // and wired: headset (3), headphones (4), USB headset (22).
    private val BLUETOOTH_TYPES = setOf(
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
      23,
      26,
      27,
      30,
    )
    private val WIRED_TYPES = setOf(
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_USB_HEADSET,
    )

    private val CAR_URI: Uri = Uri.parse("content://androidx.car.app.connection")
    private const val CAR_STATE = "CarConnectionState"
  }
}
