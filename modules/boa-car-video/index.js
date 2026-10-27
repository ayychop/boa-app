import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// BOA Originals on the car's screen, parked only (Android Automotive OS,
// modules/boa-car-video). On phones, and in builds without the module,
// isAutomotive() is false and nothing here does anything.
const native = Platform.OS === 'android' ? requireOptionalNativeModule('BoaCarVideo') : null;

export const isAvailable = !!native;

/** Whether this is a car running Android Automotive OS. */
export function isAutomotive() {
  try {
    return !!native?.isAutomotive?.();
  } catch {
    return false;
  }
}

/** The latest { parked, reason }; parked is false until the car has said so. */
export function getParked() {
  try {
    return native?.getParked?.() ?? { parked: false, reason: 'unknown' };
  } catch {
    return { parked: false, reason: 'unknown' };
  }
}

/** Calls fn({ parked, reason }) now and on every change; the car is watched while anyone listens. Returns an unsubscribe. */
export function addParkedListener(fn) {
  if (!native) return () => {};
  const sub = native.addListener('onParkedChange', fn);
  return () => sub.remove();
}

/** Plays a video file or stream in the parked-only player. Resolves false (nothing opens) unless parked. */
export async function playVideo(url, title = '') {
  try {
    return !!(await native?.playVideo?.(url, title));
  } catch {
    return false;
  }
}

/** Opens a YouTube video in the car's YouTube app. Resolves false if not parked or there's none. */
export async function openYouTube(videoId) {
  try {
    return !!(await native?.openYouTube?.(videoId));
  } catch {
    return false;
  }
}
