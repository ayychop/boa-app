import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// BOA Hi-Fi's audio effects (Android). Elsewhere, and in builds without the
// native module, the sliders still save but the sound doesn't change.
const native = Platform.OS === 'android' ? requireOptionalNativeModule('BoaEq') : null;

export const isAvailable = !!native;

/**
 * Shapes the sound of one audio session: bass and treble from -1 (cut) to
 * 1 (boost), loudness and clear vocals from 0 (off) to 1, spatial on or off,
 * boost (Bass Boost: full BassBoost and LoudnessEnhancer) and link (the
 * automatic Bluetooth boost). Returns whether any effect is on.
 */
export function apply(sessionId, { bass = 0, treble = 0, spatial = false, boost = false, loudness = 0, vocals = 0, link = true }) {
  if (!native?.apply || !(sessionId > 0)) return false;
  try {
    return !!native.apply(sessionId, bass, treble, !!spatial, !!boost, loudness, vocals, !!link);
  } catch {
    return false;
  }
}

export function release() {
  try {
    native?.release?.();
  } catch {}
}

/** Whether the phone is projecting to a car (Android Auto) or in car mode: the sound is then bigger and wider. */
export function isCar() {
  try {
    return !!native?.isCar?.();
  } catch {
    return false;
  }
}

/**
 * Where the sound is going: 'car', 'bluetooth', 'wired' or 'speaker'. On a car
 * or Bluetooth the sound is bigger and wider (see BoaEqModule.kt).
 */
export function route() {
  try {
    return native?.route?.() ?? 'speaker';
  } catch {
    return 'speaker';
  }
}

/** Calls fn('car' | 'bluetooth' | 'wired' | 'speaker') whenever the route changes; returns an unsubscribe function. */
export function addRouteListener(fn) {
  if (!native?.addListener) return () => {};
  try {
    const sub = native.addListener('onRouteChange', (e) => fn(e?.route ?? 'speaker'));
    return () => {
      try {
        sub?.remove?.();
      } catch {}
    };
  } catch {
    return () => {};
  }
}
