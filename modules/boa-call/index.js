import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// Incoming calls rung like phone calls (Android): a full-screen, call-style
// notification that wakes the phone. Elsewhere, and in builds without the
// native module, isAvailable is false and calls ring with an ordinary
// notification instead (src/calls/incoming.js).
const native = Platform.OS === 'android' ? requireOptionalNativeModule('BoaCall') : null;

export const isAvailable = !!native;

/**
 * Rings: { callId, name, link, acceptLink, channelId, timeoutMs }.
 * Resolves to whether the notification went up.
 */
export async function showIncoming(call) {
  if (!native?.showIncoming) return false;
  try {
    return await native.showIncoming(call);
  } catch {
    return false;
  }
}

/** Stops ringing. */
export async function cancelIncoming() {
  try {
    await native?.cancelIncoming?.();
  } catch {}
}

/** Calls fn(callId) when Decline is pressed on the notification; returns an unsubscribe function. */
export function addDeclineListener(fn) {
  if (!native) return () => {};
  const sub = native.addListener('onDecline', (e) => e?.callId && fn(e.callId));
  return () => sub.remove();
}

/** Whether a call may take over the screen (Android 14+ can switch it off). True without the module. */
export function canUseFullScreen() {
  try {
    return native?.canUseFullScreen ? !!native.canUseFullScreen() : true;
  } catch {
    return true;
  }
}

/** Opens the system setting that lets calls take over the screen. */
export async function openFullScreenSettings() {
  try {
    await native?.openFullScreenSettings?.();
  } catch {}
}

/** Whether Android leaves the app alone in the background (not battery optimised). True without the module. */
export function isIgnoringBatteryOptimizations() {
  try {
    return native?.isIgnoringBatteryOptimizations ? !!native.isIgnoringBatteryOptimizations() : true;
  } catch {
    return true;
  }
}

/** Asks Android to stop battery-optimising the app (or opens the list where it's done). */
export async function openBatterySettings() {
  try {
    await native?.openBatterySettings?.();
  } catch {}
}

/** Whether the app may display over other apps. True without the module. */
export function canDrawOverlays() {
  try {
    return native?.canDrawOverlays ? !!native.canDrawOverlays() : true;
  } catch {
    return true;
  }
}

/** Opens "Display over other apps" for the app. */
export async function openOverlaySettings() {
  try {
    await native?.openOverlaySettings?.();
  } catch {}
}

/** Stops showing over the lock screen (a call opened the app there, and it's over). */
export async function leaveLockScreen() {
  try {
    await native?.leaveLockScreen?.();
  } catch {}
}
