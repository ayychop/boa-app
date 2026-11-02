import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// BOA Radio yielding to calls, and stopping when the app is swiped away
// (Android). Elsewhere, and in builds without the native module, every call
// quietly does nothing and the app relies on the audio session alone.
const native = Platform.OS === 'android' ? requireOptionalNativeModule('BoaAudioGuard') : null;

export const isAvailable = !!native;

const safe = (fn, fallback) => {
  try {
    return fn() ?? fallback;
  } catch {
    return fallback;
  }
};

/** Starts watching for calls, Bluetooth hand-overs and the app being swiped away (while the radio is on). */
export function start() {
  safe(() => native?.start?.());
}

/** Stops watching. */
export function stop() {
  safe(() => native?.stop?.());
}

/** Looks at Bluetooth again, once the app may see what is connected. */
export function refresh() {
  safe(() => native?.refresh?.());
}

/** "none", "ringing" (a call is coming in) or "call" (one is on): phone, WhatsApp, BOA or any other. */
export function callMode() {
  return safe(() => native?.callMode?.(), 'none');
}

/** Whether the phone is in a car: Android Auto, car mode, or Bluetooth to a head unit. */
export function carConnected() {
  return !!safe(() => native?.carConnected?.(), false);
}

/** Android Auto projecting, or car mode. Needs no permission. */
export function androidAuto() {
  return !!safe(() => native?.androidAuto?.(), false);
}

/** Whether any Bluetooth audio is connected (a car, headphones or a speaker). */
export function bluetoothAudio() {
  return !!safe(() => native?.bluetoothAudio?.(), false);
}

/** Whether the app may see what kind of Bluetooth device is connected. */
export function bluetoothAllowed() {
  return !!safe(() => native?.bluetoothAllowed?.(), true);
}

const listen = (name, fn) => {
  if (!native?.addListener) return () => {};
  try {
    const sub = native.addListener(name, fn);
    return () => safe(() => sub?.remove?.());
  } catch {
    return () => {};
  }
};

/** Calls fn({ mode, inCall }) as a call starts ringing, is answered, or ends; returns an unsubscribe function. */
export function addCallModeListener(fn) {
  return listen('onCallMode', (e) => fn({ mode: e?.mode ?? 'none', inCall: !!e?.inCall }));
}

/** Calls fn({ event, car }) on 'playing', 'notPlaying', 'connected' or 'disconnected' from the Bluetooth speaker. */
export function addBluetoothListener(fn) {
  return listen('onBluetooth', (e) => fn({ event: e?.event, car: !!e?.car }));
}

/** Calls fn() when the app is swiped away from Recents (and was not in a car). */
export function addTaskRemovedListener(fn) {
  return listen('onTaskRemoved', () => fn());
}
