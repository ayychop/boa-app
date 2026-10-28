import { Platform, Vibration } from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { ensureAudioSession } from '../audio/session';
import { claim } from '../audio/focus';
import { RINGTONE_HAPTICS } from './ringtoneHaptics';

// The incoming-call ringtone: one looping expo-audio player, alongside the
// vibration. It claims the app's audio focus (src/audio/focus.js) so the
// radio or a soundscape stops for the call, and is released completely when
// the call is answered, declined or missed, so it never holds the audio
// session while Agora takes the microphone and speaker.
//
// Four ringtones, original loops made for BOA (assets/sounds/ringtones),
// each a whole number of bars so the loop is seamless. Which one rings is
// your profile's ringtone_preference.
//
// Or a song of your own, chosen from the phone's storage (Settings >
// Ringtone): copied into the app, so it keeps ringing if the original is
// moved or deleted. It's this phone's alone and plays whenever BOA rings
// the call itself; a call that arrives with BOA closed rings on the phone's
// call notification, which plays your built-in ringtone.
export const RINGTONES = [
  { id: 'hiphop', label: 'Hip Hop', detail: 'Boom bap at 90 BPM', icon: 'headset-outline', asset: require('../../assets/sounds/ringtones/hiphop.wav') },
  { id: 'rnb', label: 'R&B', detail: 'Slow jam, lush chords', icon: 'heart-outline', asset: require('../../assets/sounds/ringtones/rnb.wav') },
  { id: 'afrobeats', label: 'Afrobeats', detail: 'Bright mallets, rolling shakers', icon: 'sunny-outline', asset: require('../../assets/sounds/ringtones/afrobeats.wav') },
  { id: 'bashment', label: 'Bashment', detail: 'Dancehall riddim, heavy bass', icon: 'flame-outline', asset: require('../../assets/sounds/ringtones/bashment.wav') },
];
export const DEFAULT_RINGTONE = 'hiphop';
export const ringtoneById = (id) => RINGTONES.find((r) => r.id === id) ?? RINGTONES[0];

// The buzz when there's no pattern for a ringtone: long, pause, long, rest.
const FALLBACK_BUZZ = [0, 800, 600, 800, 1600];

// Your own song: { uri, name }, or null. Remembered on this phone.
const CUSTOM_KEY = 'boa.ringtone.custom';
/** The id a preview of your own song goes by. */
export const CUSTOM_RINGTONE = 'custom';
/** Songs bigger than this are turned away: a ringtone needs the first minute, not an album. */
export const MAX_CUSTOM_BYTES = 30 * 1024 * 1024;
let custom = null;
const customListeners = new Set();
const customReady = AsyncStorage.getItem(CUSTOM_KEY)
  .then((raw) => {
    const saved = raw ? JSON.parse(raw) : null;
    if (saved?.uri && !custom) custom = { uri: String(saved.uri), name: String(saved.name ?? 'Your song') };
  })
  .catch(() => {});

const fileThere = (uri) => {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
};

/** Your own song, if it's still on the phone: { uri, name }, or null. */
export function customRingtone() {
  return custom && fileThere(custom.uri) ? custom : null;
}

/** Resolves once the saved song is known (for screens that show it). */
export const loadCustomRingtone = () => customReady.then(customRingtone);

/** Calls fn(song or null) when your own song changes; returns an unsubscribe function. */
export function onCustomRingtone(fn) {
  customListeners.add(fn);
  return () => customListeners.delete(fn);
}

/** Sets (or, with null, clears) your own song. Clearing deletes the app's copy. */
export async function setCustomRingtone(song) {
  const before = custom;
  custom = song ? { uri: song.uri, name: song.name } : null;
  if (before && before.uri !== custom?.uri) {
    try {
      new File(before.uri).delete();
    } catch {}
  }
  await (custom ? AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(custom)) : AsyncStorage.removeItem(CUSTOM_KEY)).catch(() => {});
  customListeners.forEach((fn) => fn(custom));
  return custom;
}

/**
 * Lets you choose a song from the phone's storage and keeps a copy as your
 * ringtone. Resolves to the song ({ uri, name }), or null if you backed out.
 * Throws with a message to show if the file can't be used.
 */
export async function pickCustomRingtone() {
  const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: false });
  const picked = res?.canceled ? null : res?.assets?.[0];
  if (!picked?.uri) return null;
  if (picked.size && picked.size > MAX_CUSTOM_BYTES) throw new Error('That song is over 30 MB. Choose a shorter track or a smaller file.');
  const dir = new Directory(Paths.document, 'ringtones');
  dir.create({ intermediates: true, idempotent: true });
  const ext = (/\.[a-z0-9]{2,5}$/i.exec(picked.name ?? '')?.[0] ?? '.mp3').toLowerCase();
  const dest = new File(dir, `custom-${Date.now()}${ext}`);
  new File(picked.uri).copy(dest);
  const name = (picked.name ?? 'Your song').replace(/\.[^.]+$/, '').trim() || 'Your song';
  return setCustomRingtone({ uri: dest.uri, name });
}

// What actually plays: your own song when there is one, else the built-in.
function soundFor(id) {
  const song = customRingtone();
  return song ? { source: { uri: song.uri }, pattern: FALLBACK_BUZZ } : { source: ringtoneById(id).asset, pattern: null };
}

/**
 * The ringtone's vibration: a buzz on every bass hit of its loop, one loop
 * long, so it repeats in step with the sound (src/calls/ringtoneHaptics.js,
 * made from the loops by scripts/ringtone-haptics.py).
 */
export const ringtoneHaptics = (id) => RINGTONE_HAPTICS[ringtoneById(id).id] ?? FALLBACK_BUZZ;

// Started with the sound, not before it, so the first buzz lands on the first hit.
// iOS plays one fixed buzz however a pattern is written, so it gets one per loop instead.
function buzz(id, repeat, pattern) {
  Vibration.vibrate(Platform.OS === 'ios' ? 400 : (pattern ?? ringtoneHaptics(id)), repeat);
}

let player = null;

/** Starts ringing with that ringtone (a second call while ringing does nothing). */
export function startRingtone(id = DEFAULT_RINGTONE) {
  if (player) return;
  claim('call');
  const { source, pattern } = soundFor(id);
  try {
    const p = createAudioPlayer(source);
    p.loop = true;
    player = p;
    ensureAudioSession().then(() => {
      if (player !== p) return;
      p.play();
      buzz(id, true, pattern);
    });
  } catch (err) {
    player = null;
    buzz(id, true, pattern);
    console.warn('[call] ringtone failed', err?.message ?? err);
  }
}

/** Stops ringing and lets go of the player. Safe to call any time. */
export function stopRingtone() {
  const p = player;
  player = null;
  Vibration.cancel();
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
  // A built-in previews as itself, even while your own song is the ringtone.
  const { source, pattern } = id === CUSTOM_RINGTONE ? soundFor(id) : { source: ringtoneById(id).asset, pattern: null };
  try {
    const p = createAudioPlayer(source);
    const sub = p.addListener?.('playbackStatusUpdate', (s) => s?.didJustFinish && stopPreview());
    preview = { player: p, sub, onEnd };
    ensureAudioSession().then(() => {
      if (preview?.player !== p) return;
      p.play();
      // Feel it too: the preview buzzes on the bass, once through.
      buzz(id, false, pattern);
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
  Vibration.cancel();
  try {
    cur.sub?.remove?.();
    cur.player.pause();
    cur.player.remove();
  } catch {}
  cur.onEnd?.();
}
