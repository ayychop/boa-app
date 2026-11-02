package expo.modules.boaaudioguard

import android.Manifest
import android.annotation.SuppressLint
import android.app.UiModeManager
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.database.ContentObserver
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper

/**
 * Whether the phone is in a car right now, for the two things that depend on
 * it: the radio carrying on after the app is swiped away (it does in a car),
 * and which Bluetooth is "the car" when another device's call takes it over.
 *
 * A car is any of:
 *  - Android Auto projecting, or a car's built-in Android (Automotive), as
 *    androidx CarConnection reads it;
 *  - the phone in car mode;
 *  - Bluetooth audio to a device Android classes as car audio or hands-free
 *    (a head unit or a car kit; headphones and speakers are neither). Android
 *    shows an app what a Bluetooth device is only with BLUETOOTH_CONNECT, so
 *    without it this is false and Bluetooth counts as headphones.
 */
object CarLink {
  private val CAR_URI: Uri = Uri.parse("content://androidx.car.app.connection")
  private const val CAR_STATE = "CarConnectionState"

  // Bluetooth devices that are a car: a head unit, or a hands-free kit.
  private val CAR_CLASSES = setOf(
    BluetoothClass.Device.AUDIO_VIDEO_CAR_AUDIO,
    BluetoothClass.Device.AUDIO_VIDEO_HANDSFREE,
  )

  // AudioDeviceInfo types for Bluetooth: A2DP (8), SCO (7), and LE Audio's headset (26) and speaker (27).
  private val BLUETOOTH_OUTPUTS = setOf(AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLUETOOTH_SCO, 26, 27)

  fun projecting(c: Context): Boolean =
    try {
      c.contentResolver.query(CAR_URI, arrayOf(CAR_STATE), null, null, null)?.use { cur ->
        if (!cur.moveToFirst()) return@use false
        val i = cur.getColumnIndex(CAR_STATE)
        i >= 0 && cur.getInt(i) >= 1
      } ?: false
    } catch (_: Exception) {
      false
    }

  fun carMode(c: Context): Boolean =
    (c.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager)?.currentModeType == Configuration.UI_MODE_TYPE_CAR

  /** Whether the app may ask Bluetooth what a connected device is. */
  fun bluetoothAllowed(c: Context): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      c.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
    } else {
      true
    }

  private fun bluetoothOutputs(c: Context): List<AudioDeviceInfo> {
    val am = c.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return emptyList()
    return try {
      am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).filter { it.type in BLUETOOTH_OUTPUTS }
    } catch (_: Exception) {
      emptyList()
    }
  }

  /** Whether any Bluetooth audio is connected at all (a car, headphones, a speaker). */
  fun bluetoothAudio(c: Context): Boolean = bluetoothOutputs(c).isNotEmpty()

  /** Bluetooth audio to a car's head unit or hands-free kit. False when Android won't say. */
  @SuppressLint("MissingPermission")
  fun carBluetooth(c: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P || !bluetoothAllowed(c)) return false
    return try {
      val adapter = (c.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter ?: return false
      bluetoothOutputs(c).any { d ->
        val address = d.address
        if (address.isNullOrEmpty() || !BluetoothAdapter.checkBluetoothAddress(address)) return@any false
        val cls = adapter.getRemoteDevice(address).bluetoothClass ?: return@any false
        cls.deviceClass in CAR_CLASSES
      }
    } catch (_: Exception) {
      false
    }
  }

  /** In a car, by any of the three ways above. */
  fun connected(c: Context): Boolean = projecting(c) || carMode(c) || carBluetooth(c)

  /** Something watching for the car coming or going; stop() ends it. */
  class Watch(private val c: Context, private val changed: () -> Unit) {
    private val main = Handler(Looper.getMainLooper())
    private var observer: ContentObserver? = null
    private var receiver: BroadcastReceiver? = null
    private var devices: AudioDeviceCallback? = null

    fun start(): Watch {
      val o = object : ContentObserver(main) {
        override fun onChange(selfChange: Boolean) = changed()
      }
      try {
        c.contentResolver.registerContentObserver(CAR_URI, false, o)
        observer = o
      } catch (_: Exception) {
        // Android Auto isn't installed or won't say: car mode and Bluetooth still do.
      }
      val r = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = changed()
      }
      val filter = IntentFilter().apply {
        addAction(UiModeManager.ACTION_ENTER_CAR_MODE)
        addAction(UiModeManager.ACTION_EXIT_CAR_MODE)
      }
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) c.registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
        else c.registerReceiver(r, filter)
        receiver = r
      } catch (_: Exception) {
      }
      try {
        val am = c.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        if (am != null) {
          val cb = object : AudioDeviceCallback() {
            override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) = changed()
            override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) = changed()
          }
          am.registerAudioDeviceCallback(cb, main)
          devices = cb
        }
      } catch (_: Exception) {
      }
      return this
    }

    fun stop() {
      observer?.let { o -> try { c.contentResolver.unregisterContentObserver(o) } catch (_: Exception) {} }
      receiver?.let { r -> try { c.unregisterReceiver(r) } catch (_: Exception) {} }
      devices?.let { d ->
        try {
          (c.getSystemService(Context.AUDIO_SERVICE) as? AudioManager)?.unregisterAudioDeviceCallback(d)
        } catch (_: Exception) {
        }
      }
      observer = null
      receiver = null
      devices = null
    }
  }
}
