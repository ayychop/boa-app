import { setAudioModeAsync } from 'expo-audio';

// The app's one audio session, shared by the radio and Zen's soundscapes.
// expo-audio's mode is app-wide: if it isn't set, Android pauses every
// player the moment the app goes to the background or the phone locks.
// So whichever engine plays first sets it, once:
//  - playsInSilentMode: Android drops play() without a word on
//    silent/vibrate otherwise, so it must land before the first play;
//  - shouldPlayInBackground: keep playing with the screen off;
//  - doNotMixPersistent: one sound at a time (see audio/focus.js), holding
//    Android's lasting audio focus (AUDIOFOCUS_GAIN), as a music player does.
//    A phone call, or any app that wants the speaker, takes it with a
//    transient or permanent loss; expo-audio pauses on either, resumes after a
//    transient one, and other music apps are not told to start again when
//    ours stops. (doNotMix asks for the transient kind, which is for sounds
//    that last seconds, not a radio.) audio/interruptions.js adds the calls
//    that never ask for focus.
let ready = null;

/** Resolves once the audio mode is set (a failure is logged, not thrown). */
export function ensureAudioSession() {
  if (!ready) {
    ready = setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMixPersistent',
    }).catch((err) => console.warn('[audio] setAudioModeAsync failed', err));
  }
  return ready;
}
