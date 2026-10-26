import { createAudioPlayer } from 'expo-audio';
import { ensureAudioSession } from '../audio/session';
import { claim } from '../audio/focus';

// The incoming-call ringtone: one looping expo-audio player, alongside the
// vibration. It claims the app's audio focus (src/audio/focus.js) so the
// radio or a soundscape stops for the call, and is released completely when
// the call is answered, declined or missed, so it never holds the audio
// session while Agora takes the microphone and speaker.
//
// Four ringtones, original loops made for BOA (assets/sounds/ringtones),
// each a whole number of bars so the loop is seamless. Which one rings is
// your profile's ringtone_preference.
export const RINGTONES = [
  { id: 'hiphop', label: 'Hip Hop', detail: 'Boom bap at 90 BPM', icon: 'headset-outline', asset: require('../../assets/sounds/ringtones/hiphop.wav') },
  { id: 'rnb', label: 'R&B', detail: 'Slow jam, lush chords', icon: 'heart-outline', asset: require('../../assets/sounds/ringtones/rnb.wav') },
  { id: 'afrobeats', label: 'Afrobeats', detail: 'Bright mallets, rolling shakers', icon: 'sunny-outline', asset: require('../../assets/sounds/ringtones/afrobeats.wav') },
  { id: 'bashment', label: 'Bashment', detail: 'Dancehall riddim, heavy bass', icon: 'flame-outline', asset: require('../../assets/sounds/ringtones/bashment.wav') },
];
export const DEFAULT_RINGTONE = 'hiphop';
export const ringtoneById = (id) => RINGTONES.find((r) => r.id === id) ?? RINGTONES[0];

let player = null;

/** Starts ringing with that ringtone (a second call while ringing does nothing). */
export function startRingtone(id = DEFAULT_RINGTONE) {
  if (player) return;
  claim('call');
  try {
    const p = createAudioPlayer(ringtoneById(id).asset);
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

let preview = null;

/**
 * Plays a ringtone once, for choosing one in Settings. Only one preview at a
 * time; onEnd runs when it finishes or is stopped. Returns a stop function.
 */
export function previewRingtone(id, onEnd) {
  stopPreview();
  claim('call');
  try {
    const p = createAudioPlayer(ringtoneById(id).asset);
    const sub = p.addListener?.('playbackStatusUpdate', (s) => s?.didJustFinish && stopPreview());
    preview = { player: p, sub, onEnd };
    ensureAudioSession().then(() => {
      if (preview?.player === p) p.play();
    });
  } catch (err) {
    preview = null;
    console.warn('[call] ringtone preview failed', err?.message ?? err);
    onEnd?.();
  }
  return stopPreview;
}

/** Stops the Settings preview, if one is playing. */
export function stopPreview() {
  const cur = preview;
  preview = null;
  if (!cur) return;
  try {
    cur.sub?.remove?.();
    cur.player.pause();
    cur.player.remove();
  } catch {}
  cur.onEnd?.();
}
