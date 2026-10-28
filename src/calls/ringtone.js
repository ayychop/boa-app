import { Platform, Vibration } from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { ensureAudioSession } from '../audio/session';
import { claim } from '../audio/focus';
import { RINGTONE_HAPTICS } from './ringtoneHaptics';
import * as BoaCall from '../../modules/boa-call';

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
// moved or deleted. It's this phone's alone.
//
// Only one ringtone ever plays. Until you choose one in Settings > Ringtone
// it's the phone's own ringtone, so BOA's never plays over it; choose a BOA
// ringtone or a song and that rings instead, and the phone's stays quiet.
// On Android every ring, app open or closed, goes through the one native
// ringer (modules/boa-call Ringer), which follows Silent and Vibrate.
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

// Whether you chose a BOA ringtone ('boa') or left it to the phone
// ('phone', and the default: nothing saved). Remembered on this phone.
const MODE_KEY = 'boa.ringtone.mode';
/** The id the phone's own ringtone goes by in Settings > Ringtone. */
export const PHONE_RINGTONE = 'phone';
let mode = null;
const modeListeners = new Set();
const modeReady = AsyncStorage.getItem(MODE_KEY)
  .then((saved) => {
    if (mode === null && (saved === 'boa' || saved === 'phone')) mode = saved;
  })
  .catch(() => {});

/** What rings: 'custom' (your song), 'boa' (a BOA ringtone you chose) or 'phone' (the phone's own). */
export function ringChoice() {
  if (customRingtone()) return 'custom';
  return mode === 'boa' ? 'boa' : 'phone';
}

/** Resolves to ringChoice() once both the song and the choice are known. */
export const loadRingChoice = () => Promise.all([customReady, modeReady]).then(ringChoice);

/** Calls fn(choice) when it changes; returns an unsubscribe function. */
export function onRingChoice(fn) {
  modeListeners.add(fn);
  return () => modeListeners.delete(fn);
}
const emitChoice = () => modeListeners.forEach((fn) => fn(ringChoice()));

/** Chooses BOA's ringtones ('boa') or the phone's own ('phone'). */
export async function setRingMode(next) {
  mode = next === 'boa' ? 'boa' : 'phone';
  emitChoice();
  await AsyncStorage.setItem(MODE_KEY, mode).catch(() => {});
}

/**
 * Before this was a choice, picking a BOA ringtone was the only way to
 * choose. Anyone who picked one other than the default keeps it ringing.
 */
export async function adoptChosenRingtone(id) {
  await modeReady;
  if (mode === null && id && id !== DEFAULT_RINGTONE) await setRingMode('boa');
}

/**
 * The sound for the native ringer: { soundUri } for your song, { channelId }
 * for a BOA ringtone (its notification channel carries the sound), or
 * neither for the phone's own; and the buzz to go with it.
 */
export function ringSound(id) {
  const choice = ringChoice();
  if (choice === 'custom') return { soundUri: customRingtone().uri, channelId: '', vibration: FALLBACK_BUZZ };
  if (choice === 'boa') return { soundUri: '', channelId: `boa-call-${ringtoneById(id).id}`, vibration: ringtoneHaptics(id) };
  return { soundUri: '', channelId: '', vibration: FALLBACK_BUZZ };
}

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
  emitChoice();
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
let nativeRing = false;
// The native ring's own stop, a moment past any ring (the call screen ends it first).
const NATIVE_RING_MS = 60000;

/** Starts ringing with that ringtone (a second call while ringing does nothing). */
export function startRingtone(id = DEFAULT_RINGTONE) {
  if (player || nativeRing) return;
  claim('call');
  // Android: the one native ringer, so the phone's own ringtone, a BOA one
  // or your song, never two at once, on the ring volume.
  if (Platform.OS === 'android' && BoaCall.isAvailable) {
    nativeRing = true;
    BoaCall.startRinger({ ...ringSound(id), timeoutMs: NATIVE_RING_MS }).then((ok) => {
      if (ok || !nativeRing) return;
      nativeRing = false;
      // The ringer refused (an older build): ring with the app's own player.
      ringWithPlayer(id);
    });
    return;
  }
  ringWithPlayer(id);
}

// iOS, the web, and Android builds without the native ringer: expo-audio.
// The phone's own ringtone can't be played from here, so it's BOA's.
function ringWithPlayer(id) {
  if (player) return;
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
  if (nativeRing) {
    nativeRing = false;
    BoaCall.stopRinger();
  }
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
