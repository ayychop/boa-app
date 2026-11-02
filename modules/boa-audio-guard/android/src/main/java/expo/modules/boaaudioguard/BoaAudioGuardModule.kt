package expo.modules.boaaudioguard

import android.bluetooth.BluetoothA2dp
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executor

/**
 * BOA Radio yields to the phone's calls. Android's audio focus does most of
 * it (expo-audio pauses on a transient loss and resumes on the gain), but
 * not every call asks for focus: some VoIP apps never do, and a call that
 * rings on another device over the same Bluetooth speaker never reaches this
 * phone at all. So this watches two more things, which need no permission:
 *
 *  - the phone's audio MODE, which is what any call, phone, WhatsApp or BOA's
 *    own Agora call, puts the phone into while it rings (ringing) and while
 *    it's on (call). Android 12+ says when it changes; before that it is read
 *    twice a second, only while the radio is on. Events: onCallMode.
 *  - the Bluetooth speaker's A2DP stream going quiet (another phone's call
 *    taking the car) or connecting and disconnecting. Events: onBluetooth.
 *
 * `start` and `stop` bracket the time that matters (the radio playing or held
 * for a call), so nothing here runs while the app is quiet. While it runs,
 * BoaTaskGuardService is up, to stop the radio if the app is swiped away.
 */
class BoaAudioGuardModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var watching = false
  private var lastMode = "none"
  private var modeListener: Any? = null
  private var poll: Runnable? = null
  private var bluetooth: BroadcastReceiver? = null

  private val ctx: Context?
    get() = appContext.reactContext

  private val audio: AudioManager?
    get() = ctx?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  override fun definition() = ModuleDefinition {
    Name("BoaAudioGuard")

    Events("onCallMode", "onBluetooth", "onTaskRemoved")

    /** Starts watching (safe to call again). */
    Function("start") {
      start()
    }

    /** Stops watching, and the swipe-away guard with it. */
    Function("stop") {
      stop()
    }

    /** Looks at Bluetooth again (after the app was allowed to see what is connected). */
    Function("refresh") {
      registerBluetooth()
    }

    /** "none", "ringing" (a call is coming in) or "call" (one is on). */
    Function("callMode") {
      modeName()
    }

    /** Whether the phone is in a car: Android Auto, car mode, or Bluetooth to a head unit. */
    Function("carConnected") {
      ctx?.let { CarLink.connected(it) } ?: false
    }

    /** Whether Android Auto is projecting, or the phone is in car mode (no permission needed). */
    Function("androidAuto") {
      ctx?.let { CarLink.projecting(it) || CarLink.carMode(it) } ?: false
    }

    /** Whether any Bluetooth audio is connected (a car, headphones, a speaker). */
    Function("bluetoothAudio") {
      ctx?.let { CarLink.bluetoothAudio(it) } ?: false
    }

    /** Whether the app may ask Bluetooth what is connected (so it can tell a car from headphones). */
    Function("bluetoothAllowed") {
      ctx?.let { CarLink.bluetoothAllowed(it) } ?: false
    }

    OnCreate {
      live = this@BoaAudioGuardModule
    }

    OnDestroy {
      stop()
      if (live === this@BoaAudioGuardModule) live = null
    }
  }

  // ---- the phone's audio mode

  private fun modeName(): String =
    when (audio?.mode ?: AudioManager.MODE_NORMAL) {
      // 1 is ringing; 4 is a call being screened.
      AudioManager.MODE_RINGTONE, 4 -> "ringing"
      // 2 is a phone call, 3 is VoIP (WhatsApp, Agora); 5 and 6 are calls redirected to another device.
      AudioManager.MODE_IN_CALL, AudioManager.MODE_IN_COMMUNICATION, 5, 6 -> "call"
      else -> "none"
    }

  private fun check() {
    val now = modeName()
    if (now == lastMode) return
    lastMode = now
    sendEvent(
      "onCallMode",
      Bundle().apply {
        putString("mode", now)
        putBoolean("inCall", now != "none")
      },
    )
  }

  @Synchronized
  private fun start() {
    val c = ctx ?: return
    if (watching) {
      check()
      return
    }
    watching = true
    lastMode = modeName()
    val am = audio
    var listening = false
    if (am != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      try {
        val l = AudioManager.OnModeChangedListener { _ -> check() }
        am.addOnModeChangedListener(Executor { r -> main.post(r) }, l)
        modeListener = l
        listening = true
      } catch (_: Exception) {
      }
    }
    if (!listening) startPolling()
    registerBluetooth()
    taskGuard(c, true)
  }

  @Synchronized
  private fun stop() {
    watching = false
    poll?.let { main.removeCallbacks(it) }
    poll = null
    val l = modeListener
    modeListener = null
    if (l != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      try {
        audio?.removeOnModeChangedListener(l as AudioManager.OnModeChangedListener)
      } catch (_: Exception) {
      }
    }
    unregisterBluetooth()
    ctx?.let { taskGuard(it, false) }
  }

  private fun startPolling() {
    val r = object : Runnable {
      override fun run() {
        check()
        if (watching) main.postDelayed(this, POLL_MS)
      }
    }
    poll = r
    main.postDelayed(r, POLL_MS)
  }

  // ---- Bluetooth

  @Synchronized
  private fun registerBluetooth() {
    val c = ctx ?: return
    if (!watching) return
    unregisterBluetooth()
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        val state = intent.getIntExtra(BluetoothProfile.EXTRA_STATE, -1)
        val event = when (intent.action) {
          // The speaker stopped taking this phone's music (its stream is
          // suspended: another phone's call took it) or started again.
          BluetoothA2dp.ACTION_PLAYING_STATE_CHANGED -> if (state == BluetoothA2dp.STATE_PLAYING) "playing" else "notPlaying"
          BluetoothA2dp.ACTION_CONNECTION_STATE_CHANGED -> when (state) {
            BluetoothProfile.STATE_CONNECTED -> "connected"
            BluetoothProfile.STATE_DISCONNECTED -> "disconnected"
            else -> return
          }
          else -> return
        }
        sendEvent(
          "onBluetooth",
          Bundle().apply {
            putString("event", event)
            putBoolean("car", CarLink.connected(context))
          },
        )
      }
    }
    val filter = IntentFilter().apply {
      addAction(BluetoothA2dp.ACTION_PLAYING_STATE_CHANGED)
      addAction(BluetoothA2dp.ACTION_CONNECTION_STATE_CHANGED)
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) c.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      else c.registerReceiver(receiver, filter)
      bluetooth = receiver
    } catch (_: Exception) {
      // No Bluetooth on this phone, or Android won't deliver it without
      // permission: the call mode and audio focus still work.
    }
  }

  private fun unregisterBluetooth() {
    val r = bluetooth ?: return
    bluetooth = null
    try {
      ctx?.unregisterReceiver(r)
    } catch (_: Exception) {
    }
  }

  // ---- being swiped away

  private fun taskGuard(c: Context, on: Boolean) {
    try {
      val i = Intent(c, BoaTaskGuardService::class.java)
      if (on) c.startService(i) else c.stopService(i)
    } catch (_: Exception) {
      // Android won't start a service for an app in the background. The
      // radio is then playing for a car that woke it (which carries on
      // anyway), so there is nothing to guard.
    }
  }

  /** The app was swiped away: tell JS, if it is still there, to stop the sound. */
  fun taskRemoved() {
    try {
      sendEvent("onTaskRemoved", Bundle())
    } catch (_: Exception) {
    }
  }

  companion object {
    @Volatile
    var live: BoaAudioGuardModule? = null
    private const val POLL_MS = 500L
  }
}
