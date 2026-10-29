import AsyncStorage from '@react-native-async-storage/async-storage';
import * as native from '../../modules/boa-eq';

// BOA Hi-Fi: the listener's bass, treble, spatial and Bass Boost settings, kept on the
// phone and applied to the radio player's sound (modules/boa-eq) while they
// have BOA Premium. Without Premium, or with nothing playing yet, the
// sound stays flat and the settings wait.
//
// Bass and treble run from -1 to 1 around the BOA Signature sound at 0,
// which is what the very top of both sliders used to be (the phone's
// Equalizer at its ceiling, full BassBoost, a louder ceiling). -1 is truly
// flat; above 0 goes past the phone's own Equalizer range.

// v2: the sliders' zero moved up to Signature, so settings saved on the old
// scale aren't read as the new one. Spatial and Bass Boost carry over.
const KEY = 'boa.eq.v2';
const OLD_KEY = 'boa.eq.v1';
/** Every effect off: the station exactly as it's broadcast. */
export const FLAT = Object.freeze({ bass: -1, treble: -1, spatial: false, boost: false });
/** Where everyone starts: the old maximum, as the new zero. */
export const SIGNATURE = Object.freeze({ bass: 0, treble: 0, spatial: false, boost: false });

/**
 * One-tap starting points; the sliders fine-tune from there. Bass Boost
 * pushes the lows past Signature and lifts the volume ceiling (BassBoost,
 * DynamicsProcessing and LoudnessEnhancer, modules/boa-eq).
 */
export const PRESETS = [
  { id: 'signature', label: 'BOA Signature', settings: SIGNATURE },
  { id: 'bass', label: 'Bass Heavy', settings: { bass: 0.6, treble: 0.1, spatial: false, boost: false } },
  { id: 'boost', label: 'Bass Boost', settings: { bass: 1, treble: 0.3, spatial: false, boost: true } },
  { id: 'vocal', label: 'Vocal', settings: { bass: -0.5, treble: 0.25, spatial: false, boost: false } },
  { id: 'live', label: 'Live Room', settings: { bass: -0.2, treble: 0.15, spatial: true, boost: false } },
  { id: 'flat', label: 'Flat', settings: FLAT },
];

export const isSupported = native.isAvailable;

const clamp = (v) => Math.max(-1, Math.min(1, Number(v) || 0));
let settings = SIGNATURE;
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

Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(OLD_KEY)])
  .then(([raw, old]) => {
    // Changed while it was loading: what was just chosen stands.
    if (settings !== SIGNATURE) return;
    if (raw) {
      const s = JSON.parse(raw);
      settings = { bass: clamp(s.bass), treble: clamp(s.treble), spatial: !!s.spatial, boost: !!s.boost };
    } else if (old) {
      const s = JSON.parse(old);
      settings = { ...SIGNATURE, spatial: !!s.spatial, boost: !!s.boost };
    } else return;
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

function take(patch) {
  const next = { ...settings, ...patch };
  settings = { bass: clamp(next.bass), treble: clamp(next.treble), spatial: !!next.spatial, boost: !!next.boost };
}

/**
 * Live while a slider is moving: shapes the sound on the hardware at once
 * (no AsyncStorage write, no round trip), so there's no lag between the
 * thumb and the audio. The settings are saved on release (setSettings).
 */
export function preview(patch) {
  take(patch);
  apply();
}

export function setSettings(patch) {
  take(patch);
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
