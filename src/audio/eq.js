import AsyncStorage from '@react-native-async-storage/async-storage';
import * as native from '../../modules/boa-eq';

// BOA Hi-Fi: the listener's bass, treble, loudness, clear vocals, spatial, Bass Boost and Bluetooth settings, kept on the
// phone and applied to the radio player's sound (modules/boa-eq) while they
// have BOA Premium. Without Premium, or with nothing playing yet, the
// sound stays flat and the settings wait.
//
// Bass and treble run from -1 to 1 around the BOA Signature sound at 0,
// which is what the very top of both sliders used to be (the phone's
// Equalizer at its ceiling, full BassBoost, a louder ceiling). -1 is truly
// flat; above 0 goes past the phone's own Equalizer range. Loudness and Clear
// Vocals run from 0 (off) to 1 on top of that. `link` is the automatic boost
// when the sound goes to Bluetooth or a car (modules/boa-eq): on by default.

// v2: the sliders' zero moved up to Signature, so settings saved on the old
// scale aren't read as the new one. Spatial and Bass Boost carry over.
const KEY = 'boa.eq.v2';
const OLD_KEY = 'boa.eq.v1';
/** Every effect off: the station exactly as it's broadcast. */
export const FLAT = Object.freeze({ bass: -1, treble: -1, loudness: 0, vocals: 0, spatial: false, boost: false, link: true });
/** Where everyone starts: the old maximum, as the new zero. */
export const SIGNATURE = Object.freeze({ bass: 0, treble: 0, loudness: 0, vocals: 0, spatial: false, boost: false, link: true });

const preset = (over) => Object.freeze({ ...SIGNATURE, ...over });

/**
 * One-tap starting points; the sliders fine-tune from there. Bass Boost
 * pushes the lows past Signature and lifts the volume ceiling (BassBoost,
 * DynamicsProcessing and LoudnessEnhancer, modules/boa-eq). Car & Bluetooth
 * is the everything-up setting for a stereo that swallows bass and a cabin
 * that is noisy.
 */
export const PRESETS = [
  { id: 'signature', label: 'BOA Signature', settings: SIGNATURE },
  { id: 'bass', label: 'Bass Heavy', settings: preset({ bass: 0.6, treble: 0.1 }) },
  { id: 'boost', label: 'Bass Boost', settings: preset({ bass: 1, treble: 0.3, boost: true }) },
  { id: 'drive', label: 'Car & Bluetooth', settings: preset({ bass: 0.7, treble: 0.45, loudness: 0.7, vocals: 0.3, spatial: true, boost: true }) },
  { id: 'vocal', label: 'Vocal', settings: preset({ bass: -0.5, treble: 0.25, vocals: 0.6 }) },
  { id: 'live', label: 'Live Room', settings: preset({ bass: -0.2, treble: 0.15, spatial: true }) },
  { id: 'flat', label: 'Flat', settings: FLAT },
];

export const isSupported = native.isAvailable;

const clamp = (v) => Math.max(-1, Math.min(1, Number(v) || 0));
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
// What is stored (or patched in), as a full, valid set of settings. Anything
// missing (settings saved before loudness, vocals and the Bluetooth switch
// existed) takes its default.
const clean = (s) => ({
  bass: clamp(s.bass),
  treble: clamp(s.treble),
  loudness: clamp01(s.loudness),
  vocals: clamp01(s.vocals),
  spatial: !!s.spatial,
  boost: !!s.boost,
  link: s.link !== false,
});
let settings = SIGNATURE;
let allowed = false;
let session = 0;
let active = false;
// Where the sound is going: 'car', 'bluetooth', 'wired' or 'speaker'.
let route = native.route?.() ?? 'speaker';
const subs = new Set();

const snapshot = () => ({ settings, active, allowed, supported: isSupported, route });
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
      settings = clean(JSON.parse(raw));
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
  settings = clean({ ...settings, ...patch });
}

// The car or a Bluetooth device connecting or leaving: the native side has
// already re-applied the sound for the new route; this keeps the sheet's
// "boosted" badge in step.
native.addRouteListener?.((next) => {
  route = next || 'speaker';
  emit();
});

/** Where the sound is going now: 'car', 'bluetooth', 'wired' or 'speaker'. */
export const getRoute = () => route;

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
export const presetOf = (s) =>
  PRESETS.find(
    (p) =>
      p.settings.bass === s.bass &&
      p.settings.treble === s.treble &&
      p.settings.loudness === (s.loudness || 0) &&
      p.settings.vocals === (s.vocals || 0) &&
      p.settings.spatial === s.spatial &&
      p.settings.boost === !!s.boost,
  )?.id ?? null;

export function subscribe(fn) {
  subs.add(fn);
  fn(snapshot());
  return () => subs.delete(fn);
}
