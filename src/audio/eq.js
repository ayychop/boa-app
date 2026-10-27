import AsyncStorage from '@react-native-async-storage/async-storage';
import * as native from '../../modules/boa-eq';

// BOA Hi-Fi: the listener's bass, treble, spatial and Bass Boost settings, kept on the
// phone and applied to the radio player's sound (modules/boa-eq) while they
// have BOA Premium. Without Premium, or with nothing playing yet, the
// sound stays flat and the settings wait.

const KEY = 'boa.eq.v1';
export const FLAT = Object.freeze({ bass: 0, treble: 0, spatial: false, boost: false });

/**
 * One-tap starting points; the sliders fine-tune from there. Bass Boost
 * maxes the lows and lifts the volume ceiling (BassBoost and
 * LoudnessEnhancer, modules/boa-eq).
 */
export const PRESETS = [
  { id: 'flat', label: 'Flat', settings: FLAT },
  { id: 'bass', label: 'Bass Heavy', settings: { bass: 0.75, treble: 0.1, spatial: false, boost: false } },
  { id: 'boost', label: 'Bass Boost', settings: { bass: 1, treble: 0.15, spatial: false, boost: true } },
  { id: 'vocal', label: 'Vocal', settings: { bass: -0.2, treble: 0.35, spatial: false, boost: false } },
  { id: 'live', label: 'Live Room', settings: { bass: 0.3, treble: 0.25, spatial: true, boost: false } },
];

export const isSupported = native.isAvailable;

const clamp = (v) => Math.max(-1, Math.min(1, Number(v) || 0));
let settings = FLAT;
let allowed = false;
let session = 0;
let active = false;
const subs = new Set();

const snapshot = () => ({ settings, active, allowed, supported: isSupported });
const emit = () => subs.forEach((fn) => fn(snapshot()));

function apply() {
  active = native.apply(session, allowed ? settings : FLAT);
  emit();
}

AsyncStorage.getItem(KEY)
  .then((raw) => {
    if (!raw) return;
    const s = JSON.parse(raw);
    settings = { bass: clamp(s.bass), treble: clamp(s.treble), spatial: !!s.spatial, boost: !!s.boost };
    apply();
  })
  .catch(() => {});

/** The player's audio session (the native engine calls this once it exists). */
export function setSession(id) {
  session = id > 0 ? id : 0;
  apply();
}

/** Premium on or off: off flattens the sound, keeping the settings for later. */
export function setAllowed(yes) {
  if (allowed === !!yes) return;
  allowed = !!yes;
  apply();
}

export function setSettings(patch) {
  const next = { ...settings, ...patch };
  settings = { bass: clamp(next.bass), treble: clamp(next.treble), spatial: !!next.spatial, boost: !!next.boost };
  AsyncStorage.setItem(KEY, JSON.stringify(settings)).catch(() => {});
  apply();
}

export const getSettings = () => settings;

/** Which preset the settings match exactly, if any. */
export const presetOf = (s) => PRESETS.find((p) => p.settings.bass === s.bass && p.settings.treble === s.treble && p.settings.spatial === s.spatial && p.settings.boost === !!s.boost)?.id ?? null;

export function subscribe(fn) {
  subs.add(fn);
  fn(snapshot());
  return () => subs.delete(fn);
}
