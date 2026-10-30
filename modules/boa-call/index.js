import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// Incoming calls rung like phone calls (Android): a foreground service
// rings (the chosen ringtone, looping, and the buzz), posts a call-style
// notification, and its full-screen intent opens BOA's own native incoming
// call screen over the lock screen, so a locked or sleeping phone wakes
// straight to Answer and Decline without waiting for React Native. Elsewhere, and in builds without the
// native module, isAvailable is false and calls ring with an ordinary
// notification instead (src/calls/incoming.js).
const native = Platform.OS === 'android' ? requireOptionalNativeModule('BoaCall') : null;

export const isAvailable = !!native;

/**
 * Rings: { callId, name, avatar, link, acceptLink, channelId, soundUri, timeoutMs, vibration }.
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

/**
 * Rings with the app on screen, through the same native ringer as a locked
 * phone: { soundUri, channelId, timeoutMs, vibration }. The sound is
 * soundUri (your own song), else channelId's (a BOA ringtone), else the
 * phone's own ringtone. Resolves to whether it rang.
 */
export async function startRinger(ring) {
  if (!native?.startRinger) return false;
  try {
    await native.startRinger({ soundUri: '', channelId: '', timeoutMs: 60000, vibration: [], ...ring });
    return true;
  } catch {
    return false;
  }
}

/** Stops that ring. */
export async function stopRinger() {
  try {
    await native?.stopRinger?.();
  } catch {}
}

/** The screen is off and a call needs you: it lights up and shows the call over the lock screen. */
export async function wakeForCall() {
  try {
    await native?.wakeForCall?.();
  } catch {}
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

/** Picture in picture: a call is on (true) or over (false), so leaving the app floats it in a window. */
export async function setPipReady(ready) {
  try {
    await native?.setPipReady?.(!!ready);
  } catch {}
}

/** Calls fn(active) as the call goes into or comes out of its picture-in-picture window; returns an unsubscribe function. */
export function addPipListener(fn) {
  if (!native) return () => {};
  const sub = native.addListener('onPipChange', (e) => fn(!!e?.active));
  return () => sub.remove();
}

/** Keeps the floating window's Mute button in step with the real mute state. */
export async function setPipMuted(muted) {
  try {
    await native?.setPipMuted?.(!!muted);
  } catch {}
}

/** Floats the call in its picture-in-picture window right now (the Back button on a call). True if it did. */
export async function enterPip() {
  try {
    return !!(await native?.enterPip?.());
  } catch {
    return false;
  }
}

/** Whether this phone does picture in picture. */
export function isPipSupported() {
  try {
    return !!native?.isPipSupported?.();
  } catch {
    return false;
  }
}

/** Calls fn('mute' | 'chat' | 'end') when a button on the floating call window is tapped; returns an unsubscribe function. */
export function addPipActionListener(fn) {
  if (!native) return () => {};
  const sub = native.addListener('onPipAction', (e) => e?.action && fn(e.action));
  return () => sub.remove();
}

/** Stops showing over the lock screen (a call opened the app there, and it's over). */
export async function leaveLockScreen() {
  try {
    await native?.leaveLockScreen?.();
  } catch {}
}

/** A call is on (placed or answered): an ongoing-call notification holds it, so it carries on with the screen off. */
export async function startOngoing(name, callId) {
  try {
    return !!(await native?.startOngoing?.(name || 'BOA HUB member', callId || ''));
  } catch {
    return false;
  }
}

/** The call is over: the ongoing-call notification goes. */
export async function stopOngoing() {
  try {
    await native?.stopOngoing?.();
  } catch {}
}

/** Calls fn() when Hang up is pressed on the ongoing-call notification; returns an unsubscribe function. */
export function addHangUpListener(fn) {
  if (!native) return () => {};
  const sub = native.addListener('onHangUp', () => fn());
  return () => sub.remove();
}

/** Calls fn(on) as the screen goes off (the power button) and on again; returns an unsubscribe function. */
export function addScreenListener(fn) {
  if (!native) return () => {};
  const sub = native.addListener('onScreenChange', (e) => fn(e?.on !== false));
  return () => sub.remove();
}

/** The phone's thermal state: NOMINAL, FAIR, WARNING or CRITICAL. */
export function thermalState() {
  try {
    return native?.thermalState?.() || 'NOMINAL';
  } catch {
    return 'NOMINAL';
  }
}

/** Calls fn(status) as the phone heats or cools; returns an unsubscribe function. */
export function addThermalListener(fn) {
  if (!native) return () => {};
  try {
    fn(thermalState());
  } catch {}
  const sub = native.addListener('onThermalChange', (e) => fn(e?.status || 'NOMINAL'));
  return () => sub.remove();
}
