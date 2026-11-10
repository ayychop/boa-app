import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { CUSTOM_CHANNEL, DEFAULT_CHAT_SOUND, SYSTEM_CHANNEL, chatChannel, chatSoundById } from './sounds';

// Which sound a notification makes: the phone's own default, a BOA alert, or
// a clip of your own. One choice, kept on this phone, read by every chat
// notification (messages, hearts, missed calls, and pushes).
//
//   'boa'     one of the BOA alert sounds (sounds.js), which ring with the
//             app closed because their channel carries the sound.
//   'system'  the phone's default notification sound.
//   'custom'  your own clip, chosen from the phone's storage and copied into
//             the app. Android fixes a notification's sound per channel, and a
//             channel can't point at a file the app made, so your clip is played
//             by the app itself: whenever BOA is open. With BOA closed, a push
//             arrives on the phone's default sound instead (pushSound()).

const MODE_KEY = 'boa.chat.soundMode.v1';
const CUSTOM_KEY = 'boa.chat.customSound.v1';
// The BOA sound's own key, written by saveChatSound (notifications.js).
const BOA_KEY = 'boa.chat.sound';

export const SOUND_MODES = ['boa', 'system', 'custom'];
/** Clips bigger than this are turned away: an alert is a moment, not a song. */
export const MAX_CUSTOM_BYTES = 5 * 1024 * 1024;
/** However long the clip is, it plays for this long at most. */
export const CUSTOM_PLAY_MS = 8000;

let mode = 'boa';
let boaId = DEFAULT_CHAT_SOUND;
let custom = null;
// A change before the saved values arrive stands: the listener's tap wins over the disk.
let touched = false;
const listeners = new Set();
let snapshot = null;

const fileThere = (uri) => {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
};

const read = () => ({ mode, boaId, custom: customSound() });
function emit() {
  snapshot = null;
  listeners.forEach((fn) => fn());
}

const ready = Promise.all([AsyncStorage.getItem(MODE_KEY), AsyncStorage.getItem(CUSTOM_KEY), AsyncStorage.getItem(BOA_KEY)])
  .then(([savedMode, savedCustom, savedBoa]) => {
    if (touched) return;
    if (SOUND_MODES.includes(savedMode)) mode = savedMode;
    if (savedBoa) boaId = chatSoundById(savedBoa).id;
    try {
      const parsed = savedCustom ? JSON.parse(savedCustom) : null;
      if (parsed?.uri) custom = { uri: String(parsed.uri), name: String(parsed.name ?? 'Your sound') };
    } catch {}
    emit();
  })
  .catch(() => {});

/** Resolves once the saved choice has been read. */
export const loadSoundPrefs = () => ready.then(read);

export const soundMode = () => mode;
export const boaSoundId = () => boaId;

/** Your own clip, if it's still on the phone: { uri, name }, or null. */
export function customSound() {
  return custom && fileThere(custom.uri) ? custom : null;
}

/** Calls fn() when the choice changes; returns an unsubscribe function. */
export function onSoundPrefs(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const getSnapshot = () => (snapshot ??= read());

/** { mode, boaId, custom }; re-renders when the choice changes. */
export function useSoundPrefs() {
  return useSyncExternalStore(onSoundPrefs, getSnapshot, getSnapshot);
}

/** Chooses what notifications sound like: 'boa', 'system' or 'custom'. */
export async function setSoundMode(next) {
  touched = true;
  mode = SOUND_MODES.includes(next) ? next : 'boa';
  emit();
  await AsyncStorage.setItem(MODE_KEY, mode).catch(() => {});
}

/** Which BOA alert sound 'boa' means (saved by saveChatSound; this keeps the resolver in step). */
export function setBoaSoundId(id) {
  touched = true;
  boaId = chatSoundById(id).id;
  emit();
}

/** Sets (or, with null, clears) your own clip. Clearing deletes the app's copy. */
export async function setCustomSound(song) {
  touched = true;
  const before = custom;
  custom = song ? { uri: song.uri, name: song.name } : null;
  if (before && before.uri !== custom?.uri) {
    try {
      new File(before.uri).delete();
    } catch {}
  }
  // No clip, nothing to play: the choice goes back to the phone's own sound.
  if (!custom && mode === 'custom') {
    mode = 'system';
    AsyncStorage.setItem(MODE_KEY, mode).catch(() => {});
  }
  await (custom ? AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(custom)) : AsyncStorage.removeItem(CUSTOM_KEY)).catch(() => {});
  emit();
  return custom;
}

/**
 * Lets you choose a clip from the phone's storage and keeps a copy as your
 * alert sound. Resolves to { uri, name }, or null if you backed out. Throws
 * with a message to show if the file can't be used.
 */
export async function pickCustomSound() {
  const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: false });
  const picked = res?.canceled ? null : res?.assets?.[0];
  if (!picked?.uri) return null;
  if (picked.size && picked.size > MAX_CUSTOM_BYTES) throw new Error('That file is over 5 MB. Choose a short clip, a few seconds long.');
  const dir = new Directory(Paths.document, 'alert-sounds');
  dir.create({ intermediates: true, idempotent: true });
  const ext = (/\.[a-z0-9]{2,5}$/i.exec(picked.name ?? '')?.[0] ?? '.mp3').toLowerCase();
  const dest = new File(dir, `custom-${Date.now()}${ext}`);
  new File(picked.uri).copy(dest);
  const name = (picked.name ?? 'Your sound').replace(/\.[^.]+$/, '').trim() || 'Your sound';
  await setCustomSound({ uri: dest.uri, name });
  await setSoundMode('custom');
  return custom;
}

/**
 * What the database sends pushes with (push_tokens.sound). A BOA sound is its
 * own id; the phone's default and your own clip are both 'system', because a
 * push that arrives with the app closed can only use a sound the phone knows.
 */
export function pushSound() {
  return mode === 'boa' ? boaId : 'system';
}

/**
 * How a notification the app posts itself should sound right now:
 *   file       what the notification asks for ('default', a BOA file, or false for none)
 *   channelId  the Android channel (it fixes the sound, the pop up and the buzz)
 *   own        true when the app plays the sound itself (your clip, app open)
 */
export function notificationPlan(boaOverride) {
  if (mode === 'custom' && customSound() && AppState.currentState === 'active') {
    return { file: false, channelId: CUSTOM_CHANNEL, own: true };
  }
  if (mode === 'boa') {
    const tone = chatSoundById(boaOverride ?? boaId);
    return { file: tone.file, channelId: chatChannel(tone.id), own: false };
  }
  // 'system', and your own clip while the app isn't on screen.
  return { file: 'default', channelId: SYSTEM_CHANNEL, own: false };
}

// ---------------------------------------------------------------- your clip

let player = null;
let stopTimer = null;
let lastAt = 0;

/** Stops your clip if it's playing. */
export function stopCustomSound() {
  clearTimeout(stopTimer);
  const p = player;
  player = null;
  if (!p) return;
  try {
    p.pause();
    p.remove();
  } catch {}
}

/**
 * Plays your own clip once (at most CUSTOM_PLAY_MS). Several notifications
 * close together are one sound, unless `force` (the Settings preview).
 * Returns whether it started.
 */
export function playCustomSound({ force = false, now = Date.now() } = {}) {
  const song = customSound();
  if (!song) return false;
  if (!force && now - lastAt < 1200) return false;
  lastAt = now;
  stopCustomSound();
  try {
    const p = createAudioPlayer({ uri: song.uri });
    player = p;
    p.loop = false;
    p.play();
    stopTimer = setTimeout(() => {
      if (player === p) stopCustomSound();
    }, CUSTOM_PLAY_MS);
    return true;
  } catch {
    player = null;
    return false;
  }
}

/** Forgets everything in memory (tests). */
export function resetSoundPrefs() {
  stopCustomSound();
  mode = 'boa';
  boaId = DEFAULT_CHAT_SOUND;
  custom = null;
  touched = false;
  lastAt = 0;
  emit();
}
