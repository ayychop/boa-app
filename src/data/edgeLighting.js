import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Edge Lighting: a pulse of BOA gold that runs around the edges of the
// screen when something happens while the app is open: a call or video call
// rings, a message arrives, someone hearts your post. Off until
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

// Several signals can describe one event (the realtime message AND its push),
// so pulses closer together than this are one.
export const EDGE_MIN_GAP_MS = 1700;
// How often a ringing call pulses again, for as long as it rings.
export const EDGE_RING_REPEAT_MS = 3600;
let lastAt = 0;

/**
 * Something happened that the listener should see: 'call', 'message', 'heart'
 * or 'missed-call'. Pulses once if Edge Lighting is on and the app is on
 * screen; otherwise does nothing. Safe to call as often as events arrive.
 */
export function triggerEdgeLighting(kind = 'message', now = Date.now()) {
  if (!enabled || AppState.currentState !== 'active') return false;
  if (now - lastAt < EDGE_MIN_GAP_MS) return false;
  lastAt = now;
  pulses.forEach((fn) => fn(kind));
  return true;
}

/** Forgets the last pulse (tests). */
export const resetEdgeLighting = () => {
  lastAt = 0;
};

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
