import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// Screen off/on and unlock events (Android). Elsewhere, and in builds
// without the native module, there are none: Zen then only opens by hand.
const native = Platform.OS === 'android' ? requireOptionalNativeModule('BoaScreen') : null;

export const isAvailable = !!native;

/** Calls fn('off' | 'on' | 'unlocked'); returns an unsubscribe function. */
export function addScreenListener(fn) {
  if (!native) return () => {};
  const sub = native.addListener('onScreenChange', (e) => fn(e?.state));
  return () => sub.remove();
}
