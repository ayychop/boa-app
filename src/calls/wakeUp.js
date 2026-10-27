import { Alert, AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BoaCall from '../../modules/boa-call';

// What a locked Android phone needs to ring a BOA call like a phone call
// (modules/boa-call): permission to show the call full screen. Nothing else
// is asked. Calls arrive as high-priority pushes, which Android delivers
// through Doze and battery saving, and the full-screen intent opens BOA's
// own incoming-call screen without "display over other apps".
//
// Android 13 and older grant full-screen calls with the app. On Android 14+
// it's granted to calling apps too, but people can switch it off; only then
// is there anything to ask, and it's asked once, plainly, after a call
// (never at launch), at most once a month. It's asked in BOA's own words,
// in BOA's own sheet (src/components/calls/CallWakeUpPrompt.js), with a
// button straight into the system setting; a plain alert is only the
// fallback when that sheet isn't on screen.

const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
const snoozeKey = (id) => `boa.call.wake.${id}`;

export const WAKE_STEPS = [
  {
    id: 'fullscreen',
    ok: BoaCall.canUseFullScreen,
    open: BoaCall.openFullScreenSettings,
    title: 'Ring like a phone call?',
    body: 'Right now BOA calls show as a notification when your phone is locked. Allow full-screen calls and they will light up your screen like a normal call.',
  },
];

// The in-app prompt, when it's mounted: shown with the step to ask.
const prompts = new Set();

/** The in-app prompt registers here; fn(step, done) shows it and calls done() once it's answered. */
export function onWakeAsk(fn) {
  prompts.add(fn);
  return () => prompts.delete(fn);
}

async function snoozed(id) {
  try {
    const at = Number(await AsyncStorage.getItem(snoozeKey(id)));
    return !!at && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

/** The setting still standing between a locked phone and a full-screen call, or null. */
export async function nextWakeStep() {
  if (Platform.OS !== 'android' || !BoaCall.isAvailable) return null;
  for (const step of WAKE_STEPS) {
    if (!step.ok() && !(await snoozed(step.id))) return step;
  }
  return null;
}

let asking = false;

/** Asks, once, if calls can't ring full screen on this phone. Safe to call often. */
export async function askForCallWakeUp() {
  if (asking) return;
  const step = await nextWakeStep();
  if (!step) return;
  asking = true;
  // Whatever the answer, it isn't asked again for a month.
  AsyncStorage.setItem(snoozeKey(step.id), String(Date.now())).catch(() => {});
  if (prompts.size) {
    const done = () => (asking = false);
    [...prompts][0](step, done);
    return;
  }
  Alert.alert(step.title, step.body, [
    { text: 'Not now', style: 'cancel', onPress: () => (asking = false) },
    {
      text: 'Allow',
      onPress: () => {
        const sub = AppState.addEventListener('change', (state) => {
          if (state !== 'active') return;
          sub.remove();
          asking = false;
        });
        step.open();
      },
    },
  ]);
}
