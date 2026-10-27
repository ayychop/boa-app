import { Alert, AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BoaCall from '../../modules/boa-call';

// What a locked Android phone needs to ring a BOA call (modules/boa-call):
// full-screen calls allowed (Android 14+ can switch it off), the app not
// battery optimised (or the call's push is held back and the ring
// dropped, silently), and on some phones Display over other apps. Asked
// one at a time, each step after you come back from the last one's
// settings. "Not now" holds that one back for a week.

const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const snoozeKey = (id) => `boa.call.wake.${id}`;

export const WAKE_STEPS = [
  {
    id: 'fullscreen',
    ok: BoaCall.canUseFullScreen,
    open: BoaCall.openFullScreenSettings,
    title: 'Let calls ring full screen',
    body: 'So a BOA call wakes your phone and fills the screen, even when it is locked. Turn on full-screen notifications for BOA HUB.',
  },
  {
    id: 'battery',
    ok: BoaCall.isIgnoringBatteryOptimizations,
    open: BoaCall.openBatterySettings,
    title: 'Let calls reach you',
    body: 'Android is saving battery on BOA HUB, so calls can arrive late or not ring at all. Allow BOA HUB to run in the background (no battery restrictions).',
  },
  {
    id: 'overlay',
    ok: BoaCall.canDrawOverlays,
    open: BoaCall.openOverlaySettings,
    title: 'Show calls over other apps',
    body: 'Some phones only open the incoming call screen if BOA HUB may display over other apps. Turn on Display over other apps for BOA HUB.',
  },
];

async function snoozed(id) {
  try {
    const at = Number(await AsyncStorage.getItem(snoozeKey(id)));
    return !!at && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

/** The first setting still standing between a locked phone and a ringing call, or null. */
export async function nextWakeStep() {
  if (Platform.OS !== 'android' || !BoaCall.isAvailable) return null;
  for (const step of WAKE_STEPS) {
    if (!step.ok() && !(await snoozed(step.id))) return step;
  }
  return null;
}

let asking = false;

/** Asks for whatever calls still need to wake this phone, one step at a time. Safe to call often. */
export async function askForCallWakeUp() {
  if (asking) return;
  const step = await nextWakeStep();
  if (!step) return;
  asking = true;
  Alert.alert(step.title, step.body, [
    {
      text: 'Not now',
      style: 'cancel',
      onPress: () => {
        asking = false;
        AsyncStorage.setItem(snoozeKey(step.id), String(Date.now())).catch(() => {});
      },
    },
    {
      text: 'Open settings',
      onPress: () => {
        // Back from settings: on to the next step (or this one again, if it's still off).
        const sub = AppState.addEventListener('change', (state) => {
          if (state !== 'active') return;
          sub.remove();
          asking = false;
          if (step.ok()) askForCallWakeUp();
          else AsyncStorage.setItem(snoozeKey(step.id), String(Date.now())).catch(() => {});
        });
        step.open();
      },
    },
  ]);
}
