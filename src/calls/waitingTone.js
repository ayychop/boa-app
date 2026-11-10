import { Vibration } from 'react-native';
import { createAudioPlayer } from 'expo-audio';

// The call waiting tone: two short beeps and a pause, over the call you are
// on, for as long as a second caller rings (src/context/CallContext.js). It
// is quiet on purpose, and never claims the audio focus: the call you're on
// keeps it, so the other person hears nothing of this.

let player = null;

/** Starts the beeps, with a short buzz. A second call while it plays does nothing. */
export function startWaitingTone() {
  if (player) return;
  try {
    const p = createAudioPlayer(require('../../assets/sounds/call-waiting.wav'));
    p.loop = true;
    p.volume = 0.7;
    player = p;
    p.play();
  } catch (err) {
    player = null;
    console.warn('[call] waiting tone failed', err?.message ?? err);
  }
  Vibration.vibrate([0, 180, 120, 180], false);
}

/** Stops the beeps. Safe to call any time. */
export function stopWaitingTone() {
  const p = player;
  player = null;
  if (!p) return;
  try {
    p.pause();
    p.remove();
  } catch (err) {
    console.warn('[call] waiting tone stop failed', err?.message ?? err);
  }
}
