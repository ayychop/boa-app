import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// The Zen screensaver's look. "The Room" is the original: the soundscape's
// own scene. The rest are quiet, dark, and made to be left on a bedside
// table: none of them goes brighter than a candle, and Midnight is pure
// black with only the clock lit (kindest to an OLED screen, and to sleep).
//
// The choice is kept on the phone and shared across the app, like the
// Hi-Fi settings (src/audio/eq.js).

const KEY = 'boa.zen.screensaver.v1';

/** swatch: the two colours of the picker's thumbnail. */
export const SCREENSAVERS = [
  { id: 'room', name: 'The Room', blurb: 'Your soundscape’s own scene', swatch: ['#3A2410', '#B9792A'] },
  { id: 'aurora', name: 'Aurora', blurb: 'Slow ribbons of teal, violet and gold', swatch: ['#12353A', '#5B3FB0'] },
  { id: 'halo', name: 'Halo', blurb: 'Gold rings breathing outward', swatch: ['#0B0B0D', '#E2A84B'] },
  { id: 'ember', name: 'Embers', blurb: 'Sparks rising from a banked fire', swatch: ['#1A0C06', '#E2733B'] },
  { id: 'midnight', name: 'Midnight', blurb: 'Pure black. Only the clock', swatch: ['#000000', '#26262B'] },
];

export const DEFAULT_SCREENSAVER = 'room';
export const screensaverById = (id) => SCREENSAVERS.find((s) => s.id === id) ?? SCREENSAVERS[0];

let current = DEFAULT_SCREENSAVER;
let chosen = false;
const subs = new Set();
const emit = () => subs.forEach((fn) => fn());

AsyncStorage.getItem(KEY)
  .then((raw) => {
    // Picked while it was loading: that choice stands.
    if (chosen || !raw) return;
    const id = screensaverById(raw).id;
    if (id !== current) {
      current = id;
      emit();
    }
  })
  .catch(() => {});

export const getScreensaver = () => current;

export function setScreensaver(id) {
  const next = screensaverById(id).id;
  chosen = true;
  if (next !== current) {
    current = next;
    emit();
  }
  AsyncStorage.setItem(KEY, next).catch(() => {});
}

export function subscribeScreensaver(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** The chosen screensaver's id; re-renders when it changes. */
export function useScreensaver() {
  return useSyncExternalStore(subscribeScreensaver, getScreensaver, getScreensaver);
}
