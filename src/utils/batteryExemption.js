import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BoaAlarm from '../../modules/boa-alarm';

/**
 * Android's "always run in the background?" box, handled the polite way.
 *
 * The phone can put BOA to sleep, and then an alarm doesn't ring. Android has
 * a list of battery-optimised apps for that (Google Play restricts the one-tap
 * box's permission, and alarms set with setAlarmClock ring through Doze
 * regardless). The rules here keep it from turning into a nag:
 *
 *  - it comes up on its own ONCE, at a sensible moment (the first time the
 *    user turns on a radio alarm), never again by itself, whatever the answer;
 *  - "Don't allow" is respected: it is remembered, nothing re-asks, and the
 *    only trace is a quiet line in Alarm settings the user can tap (or close);
 *  - when the phone is already exempt, nothing is shown at all.
 */

const KEY = 'boa.battery.v1';

export const BATTERY = {
  granted: 'granted', // the app runs unrestricted
  declined: 'declined', // asked, and the answer was no
  pending: 'pending', // not asked yet
  unsupported: 'unsupported', // not Android, or this build can't ask
};

async function read() {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) || '{}') || {};
  } catch {
    return {};
  }
}

async function write(patch) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...(await read()), ...patch }));
  } catch {}
}

/** Where things stand now. The phone's own answer wins over what was remembered. */
export async function batteryStatus() {
  if (!BoaAlarm.isAvailable) return BATTERY.unsupported;
  const exempt = BoaAlarm.isIgnoringBatteryOptimizations();
  if (exempt === null) return BATTERY.unsupported;
  if (exempt) return BATTERY.granted;
  return (await read()).askedAt ? BATTERY.declined : BATTERY.pending;
}

/** Whether the quiet line in Alarm settings was closed by the user. */
export async function batteryTipDismissed() {
  return !!(await read()).dismissed;
}

export const dismissBatteryTip = () => write({ dismissed: true });

// Waits for the user to come back from Android's box, then reads the answer.
function afterReturn() {
  return new Promise((resolve) => {
    let seenAway = false;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      sub.remove();
      clearTimeout(timer);
      resolve(BoaAlarm.isIgnoringBatteryOptimizations() === true);
    };
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') seenAway = true;
      else if (seenAway) setTimeout(finish, 250);
    });
    // The box can show without the app leaving the foreground: read the answer anyway.
    const timer = setTimeout(finish, 45000);
  });
}

/**
 * Shows Android's box. `byUser` is a tap on the quiet line, which may ask
 * again; without it, this asks only if it never has. Returns the status after.
 */
export async function requestBatteryExemption({ byUser = false } = {}) {
  const now = await batteryStatus();
  if (now === BATTERY.granted || now === BATTERY.unsupported) return now;
  if (now === BATTERY.declined && !byUser) return now;
  // Remembered first: whatever happens next, it was asked once.
  await write({ askedAt: Date.now() });
  const shown = BoaAlarm.requestIgnoreBatteryOptimizations();
  if (shown === 'none') {
    // This phone has no box and no list. The app's own settings page is the last stop.
    if (byUser) BoaAlarm.openBatterySettings();
    return BATTERY.declined;
  }
  const ok = await afterReturn();
  await write({ outcome: ok ? 'granted' : 'declined' });
  return ok ? BATTERY.granted : BATTERY.declined;
}
