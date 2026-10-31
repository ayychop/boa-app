import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Edge Lighting: a pulse of BOA gold that runs around the edges of the
// screen when a notification arrives while the app is open. Off until
// the listener turns it on (Profile > Edge Lighting). The choice is kept on
// the phone and shared across the app.

const KEY = 'boa.edgeLighting.v1';

let enabled = false;
let chosen = false;
const subs = new Set();
const pulses = new Set();
const emit = () => subs.forEach((fn) => fn());

AsyncStorage.getItem(KEY)
  .then((raw) => {
    // Chosen while it was loading: that choice stands.
    if (chosen || raw == null) return;
    const on = raw === '1';
    if (on !== enabled) {
      enabled = on;
      emit();
    }
  })
  .catch(() => {});

export const isEdgeLightingOn = () => enabled;

export function setEdgeLighting(on) {
  chosen = true;
  if (!!on !== enabled) {
    enabled = !!on;
    emit();
  }
  AsyncStorage.setItem(KEY, enabled ? '1' : '0').catch(() => {});
}

/** Fire one pulse now (whatever the setting: the toggle uses it as a preview). */
export function pulseEdgeLighting() {
  pulses.forEach((fn) => fn());
}

/** The overlay registers here to be told when to pulse. */
export function onEdgePulse(fn) {
  pulses.add(fn);
  return () => pulses.delete(fn);
}

export function subscribeEdgeLighting(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** Whether Edge Lighting is on; re-renders when it changes. */
export function useEdgeLighting() {
  return useSyncExternalStore(subscribeEdgeLighting, isEdgeLightingOn, isEdgeLightingOn);
}
