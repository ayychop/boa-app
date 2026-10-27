import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// BOA Radio in the car (Android Auto). Everywhere else, and in builds
// without the native module, every call quietly does nothing.
const native = Platform.OS === 'android' ? requireOptionalNativeModule('BoaAuto') : null;

export const isAvailable = !!native;

/** The car's station browser: { folders: [{ id, title, stations }] }. */
export function setCatalogue(catalogue) {
  try {
    native?.setCatalogue(JSON.stringify(catalogue));
  } catch {}
}

/** What's on, for the car's now playing screen and controls. favourite and hyped null hide the heart and the fire. */
export function setPlayback({ status, mediaId = null, title = null, artist = null, artwork = null, canStep = false, favourite = null, hyped = null }) {
  try {
    native?.setPlayback(status, mediaId, title, artist, artwork, !!canStep, favourite === null ? null : !!favourite, hyped === null ? null : !!hyped);
  } catch {}
}

/**
 * Taps on the car screen: { action, mediaId }, where action is play,
 * resume, pause, next, previous, favourite, fire or catalogue. Returns an unsubscribe.
 */
export function addCommandListener(fn) {
  if (!native) return () => {};
  const sub = native.addListener('onCommand', fn);
  return () => sub.remove();
}
