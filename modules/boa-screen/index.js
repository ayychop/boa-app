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

/**
 * Whether the screen is on. True where it can't be known (iOS, the web, a
 * build without the native module, or one from before this was added).
 */
export function isScreenOn() {
  try {
    return native?.isInteractive ? !!native.isInteractive() : true;
  } catch {
    return true;
  }
}

/**
 * Hides (true) or brings back (false) the system navigation bar: the Zen
 * screensaver is the whole screen, with no dark bar across its foot. False
 * where it isn't available. Never throws.
 */
export async function setImmersive(on) {
  if (!native?.setImmersive) return false;
  try {
    return await native.setImmersive(!!on);
  } catch {
    return false;
  }
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

/**
 * Android's FLAG_SECURE: while on, screenshots and screen recordings of
 * the app come out black, and it's blanked in the recent-apps view. On for
 * as long as a view-once photo or video is open. False where it isn't
 * available (iOS, the web, builds without the native module).
 */
export async function setSecure(on, key = 'viewonce') {
  if (!native?.setSecure) return false;
  try {
    // Each reason (view-once media, a call's Privacy Mode) holds the flag
    // under its own key, so one letting go can't un-protect the other.
    if (native.setSecureFor) return await native.setSecureFor(String(key), !!on);
    return await native.setSecure(!!on);
  } catch {
    return false;
  }
}
