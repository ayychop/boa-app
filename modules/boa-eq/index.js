import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// BOA Hi-Fi's audio effects (Android). Elsewhere, and in builds without the
// native module, the sliders still save but the sound doesn't change.
const native = Platform.OS === 'android' ? requireOptionalNativeModule('BoaEq') : null;

export const isAvailable = !!native;

/**
 * Shapes the sound of one audio session: bass and treble from -1 (cut) to
 * 1 (boost), spatial on or off. Returns whether any effect is on.
 */
export function apply(sessionId, { bass = 0, treble = 0, spatial = false }) {
  if (!native?.apply || !(sessionId > 0)) return false;
  try {
    return !!native.apply(sessionId, bass, treble, !!spatial);
  } catch {
    return false;
  }
}

export function release() {
  try {
    native?.release?.();
  } catch {}
}
