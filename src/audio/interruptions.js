import { AppState, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as guard from '../../modules/boa-audio-guard';
import * as engine from './engine';
import * as ambient from './ambient';

// BOA Radio gets out of the way of a call, and stops when the app is swiped away.
//
// What holds the sound:
//  1. A call on this phone. Android's audio focus does most of it (expo-audio
//     pauses on a focus loss and resumes on the gain, audio/session.js), but
//     some calls never ask for focus, and some ask only once answered. Every
//     call, whoever's app it is, puts the phone's audio mode into "ringing" and
//     then "call", and that is what's watched (modules/boa-audio-guard), plus
//     BOA's own calls, which CallContext reports (setAppCall). The radio and Zen
//     pause the instant a call rings or is placed, stay paused for the whole
//     call, and carry on by themselves after it, unless you paused them yourself.
//  2. A call on another device over the same Bluetooth speaker: the speaker
//     drops this phone's stream (or the car disconnects). The radio yields and
//     waits for you to press play, as nothing says when that call ends.
//  3. Losing audio focus for good (another music app): expo-audio pauses it and
//     it stays paused. Nothing to do.
//
// And the swipe: BOA Radio plays from a foreground service, which outlives the
// app being swiped away from Recents. The native guard stops it then (and
// tells us, so a pause reaches JS too), except in a car: Android Auto, car
// mode, or Bluetooth to a head unit, where it carries on and stops the moment
// the car is left. See BoaTaskGuardService.kt.
//
// Everything here runs only while something is playing or held, so a quiet app
// costs nothing.

const ASKED_KEY = 'boa.bluetoothAsked.v1';
// The radio must have played this long before its Bluetooth stream stopping counts as a hand-over (not a stall).
const HAND_OVER_AFTER_MS = 4000;
// And not within this long of you pausing it yourself.
const USER_PAUSE_GRACE_MS = 2500;
// Idle this long before the watch is switched off.
const IDLE_MS = 3000;

let started = false;
let appCall = false;
let mode = 'none';
let zenHeld = null; // the soundscape a call paused
let idleTimer = null;
let watching = false;
let radio = { status: 'idle', interrupted: null };
let zen = { status: 'idle' };
let offs = [];
const listeners = new Set();

/** Whether a call is ringing or on, on this phone: any app's, or BOA's own. */
export const isOnCall = () => appCall || mode !== 'none';

/** 'ringing', 'call' or 'none': the strongest of what the phone says and what BOA's own call says. */
export const callState = () => (mode !== 'none' ? mode : appCall ? 'call' : 'none');

/** Calls fn(isOnCall) whenever a call starts or ends; returns an unsubscribe function. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function apply() {
  const on = isOnCall();
  if (on) {
    engine.interrupt('call');
    if (zen.status === 'playing' || zen.status === 'loading') {
      zenHeld = ambient.getState().id;
      ambient.pause();
    }
  } else {
    engine.endInterruption('call');
    const held = zenHeld;
    zenHeld = null;
    if (held && ambient.getState().id === held && ambient.getState().status === 'paused') ambient.play(held);
  }
  listeners.forEach((fn) => fn(on));
  watch();
}

/** BOA's own call (placed, ringing or on) started or ended. CallContext tells us. */
export function setAppCall(active) {
  const next = !!active;
  if (next === appCall) return;
  appCall = next;
  apply();
}

// The guard watches only while the radio plays or is held, and for a moment after.
function wanted() {
  const radioOn = radio.status === 'playing' || radio.status === 'loading' || !!radio.interrupted;
  const zenOn = zen.status === 'playing' || zen.status === 'loading' || !!zenHeld;
  return radioOn || zenOn || isOnCall();
}

function watch() {
  if (wanted()) {
    clearTimeout(idleTimer);
    idleTimer = null;
    if (!watching) {
      watching = true;
      guard.start();
      // Whatever happened before it was watching.
      mode = guard.callMode();
      if (isOnCall()) apply();
    }
    return;
  }
  if (watching && !idleTimer) {
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (wanted()) return;
      watching = false;
      guard.stop();
    }, IDLE_MS);
  }
}

// Asked once, in the foreground, the first time the radio plays with Bluetooth
// audio connected: it is what lets the app tell a car from headphones, so a
// car keeps playing when the app is swiped away. Saying no changes nothing else,
// and it is never asked again.
async function askForBluetooth() {
  if (Platform.OS !== 'android' || Platform.Version < 31) return;
  if (!guard.isAvailable || guard.bluetoothAllowed() || !guard.bluetoothAudio()) return;
  if (AppState.currentState !== 'active') return;
  try {
    if (await AsyncStorage.getItem(ASKED_KEY)) return;
    await AsyncStorage.setItem(ASKED_KEY, '1');
    const result = await PermissionsAndroid.request('android.permission.BLUETOOTH_CONNECT', {
      title: 'Keep BOA Radio playing in your car',
      message: 'Allow BOA HUB to see that your phone is connected to a car (not headphones), so the radio keeps playing in the car after you close the app, and stops everywhere else.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    });
    if (result === PermissionsAndroid.RESULTS.GRANTED) guard.refresh();
  } catch {
    // Never a reason to stop the music.
  }
}

function onRadio(state) {
  const wasPlaying = radio.status === 'playing';
  radio = state;
  if (state.status === 'playing' && !wasPlaying) askForBluetooth();
  watch();
}

function onBluetooth({ event }) {
  if (radio.status !== 'playing') return;
  if (event === 'notPlaying') {
    // The speaker stopped taking this phone's stream. If you didn't pause it
    // and it had been playing steadily, another device took the speaker.
    if (engine.playingFor() > HAND_OVER_AFTER_MS && Date.now() - engine.lastUserPause() > USER_PAUSE_GRACE_MS) engine.interrupt('bluetooth');
  } else if (event === 'disconnected') {
    // The speaker went (the car was left, or it was handed to another phone):
    // the sound would jump to the phone's own speaker.
    engine.interrupt('bluetooth');
  }
}

/** The app was swiped away and the guard let it go: stop all sound. */
export function stopEverything() {
  engine.pause();
  ambient.stop();
  zenHeld = null;
  watching = false;
  guard.stop();
}

/** Connects it all, once, as JS starts (index.js). */
export function start() {
  if (started) return;
  started = true;
  offs = [
    engine.subscribe(onRadio),
    ambient.subscribe((s) => {
      zen = s;
      watch();
    }),
    guard.addCallModeListener(({ mode: next }) => {
      mode = next;
      apply();
    }),
    guard.addBluetoothListener(onBluetooth),
    guard.addTaskRemovedListener(stopEverything),
  ];
  // Back in the app: look again, as an event may have been missed asleep.
  const sub = AppState.addEventListener('change', (next) => {
    if (next !== 'active' || !watching) return;
    const now = guard.callMode();
    if (now !== mode) {
      mode = now;
      apply();
    }
  });
  offs.push(() => sub.remove());
}

/** Test hook: forget everything. */
export function reset() {
  offs.forEach((off) => off());
  offs = [];
  clearTimeout(idleTimer);
  idleTimer = null;
  started = false;
  appCall = false;
  mode = 'none';
  zenHeld = null;
  watching = false;
  radio = { status: 'idle', interrupted: null };
  zen = { status: 'idle' };
  listeners.clear();
}
