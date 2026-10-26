import AsyncStorage from '@react-native-async-storage/async-storage';
import * as native from '../../modules/boa-eq';

// BOA Hi-Fi: the listener's bass, treble and spatial settings, kept on the
// phone and applied to the radio player's sound (modules/boa-eq) while they
// have BOA Premium. Without Premium, or with nothing playing yet, the
// sound stays flat and the settings wait.

const KEY = 'boa.eq.v1';
export const FLAT = Object.freeze({ bass: 0, treble: 0, spatial: false });

/** One-tap starting points; the sliders fine-tune from there. */
export const PRESETS = [
  { id: 'flat', label: 'Flat', settings: FLAT },
  { id: 'bass', label: 'Bass Heavy', settings: { bass: 0.75, treble: 0.1, spatial: false } },
  { id: 'vocal', label: 'Vocal', settings: { bass: -0.2, treble: 0.35, spatial: false } },
  { id: 'live', label: 'Live Room', settings: { bass: 0.3, treble: 0.25, spatial: true } },
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
    settings = { bass: clamp(s.bass), treble: clamp(s.treble), spatial: !!s.spatial };
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
  settings = { bass: clamp(next.bass), treble: clamp(next.treble), spatial: !!next.spatial };
  AsyncStorage.setItem(KEY, JSON.stringify(settings)).catch(() => {});
  apply();
}

export const getSettings = () => settings;

/** Which preset the settings match exactly, if any. */
export const presetOf = (s) =>
  PRESETS.find((p) => p.settings.bass === s.bass && p.settings.treble === s.treble && p.settings.spatial === s.spatial)?.id ?? null;

export function subscribe(fn) {
  subs.add(fn);
  fn(snapshot());
  return () => subs.delete(fn);
}
