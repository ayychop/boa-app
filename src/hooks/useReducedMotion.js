import { useSyncExternalStore } from 'react';
import { useReducedMotion as useSystemReducedMotion } from 'react-native-reanimated';
import * as thermal from '../calls/thermal';

// "Keep it still" for the app's decorative, background motion: the phone's
// Reduce Motion setting, OR the phone running warm. Smoke, grain, the sheen
// on the initials, spinning records, the Zen room and the rest all ask this
// instead of reanimated's own hook, so a phone that is heating up (a Flip 7's
// Exynos on a charger, a long call) stops doing work nobody needs, from the
// first sign of warmth (Android's LIGHT status, or the battery at 38 C, 36 C
// while charging: modules/boa-call) rather than only once it's hot.
//
// Every use shares one native subscription (src/calls/thermal.js).
function subscribe(onChange) {
  thermal.start();
  const off = thermal.subscribe(() => onChange());
  return () => {
    off();
    thermal.stop();
  };
}
const snapshot = () => thermal.isWarm();

/** Whether the phone is running warm: true from FAIR up. */
export function useWarm() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Reduce Motion, or a warm phone. Same shape as reanimated's useReducedMotion. */
export default function useReducedMotion() {
  const system = useSystemReducedMotion();
  const warm = useWarm();
  return system || warm;
}
