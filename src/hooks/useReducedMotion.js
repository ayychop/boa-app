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
const hotSnapshot = () => thermal.isHot();

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

/** Whether the phone is properly hot (WARNING or CRITICAL), not merely warm. */
export function useHot() {
  return useSyncExternalStore(subscribe, hotSnapshot, hotSnapshot);
}

/**
 * For motion that plays once and ends (a panel arriving, a button's ripple, a
 * muted video that only has to hold): Reduce Motion, or a phone that is hot.
 * Not merely warm: a phone on a charger or in the sun sits at "warm" all day,
 * and gating a 400 ms entrance on that left the whole app without animation.
 * Loops that run until stopped (smoke, grain, spinning records) keep using the
 * stricter default above.
 */
export function useCalm() {
  const system = useSystemReducedMotion();
  const hot = useHot();
  return system || hot;
}
