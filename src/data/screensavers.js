import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// The Zen screensaver's look. "Starry Night" and "Rainy Window" are the two
// originals (the first Zen's looping videos) and the defaults; "The Room" is
// the soundscape's own scene. The rest are quiet, dark, and made to be left
// on a bedside table: none of them goes brighter than a candle, and Midnight
// is pure black with only the clock lit (kindest to an OLED screen, and to
// sleep).
//
// The choice is kept on the phone and shared across the app, like the
// Hi-Fi settings (src/audio/eq.js).

const KEY = 'boa.zen.screensaver.v1';

/**
 * swatch: the two colours of the picker's thumbnail.
 * scene: plays that scene (src/data/sleep.js) whatever the sound. No `scene`
 * and no `generative`: the scene follows the soundscape.
 * generative: drawn (src/components/zen/Screensavers.js), no video or photo.
 */
export const SCREENSAVERS = [
  { id: 'night', scene: 'night', name: 'Starry Night', blurb: 'Your original: the night sky, turning slowly', swatch: ['#0A1230', '#2A3F7A'] },
  { id: 'rain', scene: 'rain', name: 'Rainy Window', blurb: 'Your original: rain on the glass of a night city', swatch: ['#10202B', '#3E6A82'] },
  { id: 'room', name: 'The Room', blurb: 'Your soundscape’s own scene', swatch: ['#3A2410', '#B9792A'] },
  { id: 'aurora', generative: true, name: 'Aurora', blurb: 'Slow ribbons of teal, violet and gold', swatch: ['#12353A', '#5B3FB0'] },
  { id: 'halo', generative: true, name: 'Halo', blurb: 'Gold rings breathing outward', swatch: ['#0B0B0D', '#E2A84B'] },
  { id: 'ember', generative: true, name: 'Embers', blurb: 'Sparks rising from a banked fire', swatch: ['#1A0C06', '#E2733B'] },
  { id: 'midnight', generative: true, name: 'Midnight', blurb: 'Pure black. Only the clock', swatch: ['#000000', '#26262B'] },
];

export const DEFAULT_SCREENSAVER = 'night';
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
