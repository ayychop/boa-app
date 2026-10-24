import { setAudioModeAsync } from 'expo-audio';

// The app's one audio session, shared by the radio and Zen's soundscapes.
// expo-audio's mode is app-wide: if it isn't set, Android pauses every
// player the moment the app goes to the background or the phone locks.
// So whichever engine plays first sets it, once:
//  - playsInSilentMode: Android drops play() without a word on
//    silent/vibrate otherwise, so it must land before the first play;
//  - shouldPlayInBackground: keep playing with the screen off;
//  - doNotMix: one sound at a time (see audio/focus.js).
let ready = null;

/** Resolves once the audio mode is set (a failure is logged, not thrown). */
export function ensureAudioSession() {
  if (!ready) {
    ready = setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch((err) => console.warn('[audio] setAudioModeAsync failed', err));
  }
  return ready;
}
