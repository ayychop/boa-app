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

/** Whether the system lock screen is up. */
export function isLocked() {
  try {
    return !!native?.isLocked?.();
  } catch {
    return false;
  }
}

/**
 * Shows the app (the Zen screensaver, already on screen) over the lock
 * screen, so it's what you see when the screen comes back on.
 */
export async function showOverLock() {
  if (!native?.showOverLock) return false;
  try {
    return await native.showOverLock();
  } catch {
    return false;
  }
}

/**
 * Dismisses the lock screen (asking for the PIN or fingerprint if set):
 * true once unlocked, false if cancelled. True straight away when it isn't
 * locked, or without the native module.
 */
export async function unlock() {
  if (!native?.unlock) return true;
  try {
    return await native.unlock();
  } catch {
    return false;
  }
}

/** Stops showing over the lock screen. */
export async function clearOverLock() {
  try {
    await native?.clearOverLock?.();
  } catch {}
}
