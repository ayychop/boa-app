import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// The home screen widget bridge (Android). Everywhere else, and in builds
// without the native module, every call quietly does nothing.
const native = Platform.OS === 'android' ? requireOptionalNativeModule('BoaWidget') : null;

export const isAvailable = !!native;

export function setStyle(color, opacity) {
  return native ? native.setStyle(color, opacity).catch(() => {}) : Promise.resolve();
}

export function setNowPlaying(title, subtitle) {
  return native ? native.setNowPlaying(title ?? null, subtitle ?? null).catch(() => {}) : Promise.resolve();
}

export function count() {
  return native ? native.count().catch(() => 0) : Promise.resolve(0);
}
