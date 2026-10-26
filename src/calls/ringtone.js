import { createAudioPlayer } from 'expo-audio';
import { ensureAudioSession } from '../audio/session';
import { claim } from '../audio/focus';

// The incoming-call ringtone: one looping expo-audio player, alongside the
// vibration. It claims the app's audio focus (src/audio/focus.js) so the
// radio or a soundscape stops for the call, and is released completely when
// the call is answered, declined or missed, so it never holds the audio
// session while Agora takes the microphone and speaker.
//
// To change the sound, replace this one file.
export const RINGTONE = require('../../assets/sounds/alarm_classic.wav');

let player = null;

/** Starts ringing (a second call while ringing does nothing). */
export function startRingtone() {
  if (player) return;
  claim('call');
  try {
    const p = createAudioPlayer(RINGTONE);
    p.loop = true;
    player = p;
    ensureAudioSession().then(() => {
      if (player === p) p.play();
    });
  } catch (err) {
    player = null;
    console.warn('[call] ringtone failed', err?.message ?? err);
  }
}

/** Stops ringing and lets go of the player. Safe to call any time. */
export function stopRingtone() {
  const p = player;
  player = null;
  if (!p) return;
  try {
    p.pause();
    p.remove();
  } catch (err) {
    console.warn('[call] ringtone stop failed', err?.message ?? err);
  }
}
