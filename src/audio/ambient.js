import { createAudioPlayer } from 'expo-audio';
import { MEDIA_HEADERS, SOUNDSCAPES, soundscapeById } from '../data/sleep';
import { cachedSource, cachedUri, prefetch } from '../utils/mediaCache';
import * as radio from './engine';

// Soundscape engine for the Sleep & Meditation Hub: one looping expo-audio
// player, separate from the radio's. Starting a soundscape pauses the radio
// straight away: you came to Zen for the rain, not the rain and a station.
//
// It starts at once: from the cache if the recording is already on the
// phone, otherwise streaming while a copy downloads in the background for
// next time (utils/mediaCache.js).
let player = null;
let state = { id: null, status: 'idle', volume: 1 };
let fadeTimer = null;
let gen = 0;
const listeners = new Set();

// Whether the radio is on, so starting a soundscape only pauses it then.
let radioStatus = 'idle';
radio.subscribe((r) => {
  radioStatus = r.status;
});

function pauseRadio() {
  if (radioStatus === 'playing' || radioStatus === 'loading') radio.pause();
}

function emit(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

/** A local copy of the soundscape, downloading it the first time. */
export const localSource = (soundscape) => cachedSource('soundscapes', `${soundscape.id}.mp3`, soundscape.uri);

/**
 * Something that plays now: the cached copy, else the stream (and the
 * download starts in the background, so the next play is from the phone).
 */
function instantSource(soundscape) {
  const local = cachedUri('soundscapes', `${soundscape.id}.mp3`);
  if (local) return { uri: local };
  localSource(soundscape);
  return { uri: soundscape.uri, headers: MEDIA_HEADERS };
}

/** Downloads every soundscape in the background (the Zen tab calls this). */
export function warmUp() {
  return prefetch(SOUNDSCAPES.map((s) => ({ folder: 'soundscapes', name: `${s.id}.mp3`, uri: s.uri })));
}

function stopFade() {
  clearInterval(fadeTimer);
  fadeTimer = null;
}

/** Starts a soundscape looping (or carries on if it's already the one playing). */
export async function play(id) {
  const soundscape = soundscapeById(id);
  if (!soundscape) return;
  stopFade();
  pauseRadio();
  if (state.id === id && player && state.status !== 'error') {
    player.volume = state.volume;
    player.play();
    return emit({ status: 'playing' });
  }
  ++gen;
  emit({ id, status: 'loading' });
  try {
    const source = instantSource(soundscape);
    if (!player) {
      player = createAudioPlayer(source, { updateInterval: 1000 });
      player.addListener('playbackStatusUpdate', (s) => {
        if (s.error && state.status !== 'idle') emit({ status: 'error' });
      });
    } else {
      player.replace(source);
    }
    player.loop = true;
    player.volume = state.volume;
    player.play();
    emit({ status: 'playing' });
  } catch (err) {
    console.warn(`[ambient] couldn't play ${id}`, err?.message ?? err);
    emit({ status: 'error' });
  }
}

export function pause() {
  stopFade();
  player?.pause();
  if (state.id) emit({ status: 'paused' });
}

export function toggle(id) {
  if (state.id === id && (state.status === 'playing' || state.status === 'loading')) return pause();
  return play(id);
}

/** Stops and forgets the soundscape. */
export function stop() {
  gen += 1;
  stopFade();
  player?.pause();
  emit({ id: null, status: 'idle' });
}

export function setVolume(volume) {
  const v = Math.max(0, Math.min(1, volume));
  if (player) player.volume = v;
  emit({ volume: v });
}

/**
 * Fades the soundscape out over `ms` (an ease-out curve, so the last part
 * is the quietest and longest), then stops it and puts the volume back for
 * next time. Resolves when it's done.
 */
export function fadeOut(ms = 30000) {
  stopFade();
  if (!player || state.status !== 'playing') return Promise.resolve();
  const from = state.volume;
  const started = Date.now();
  return new Promise((resolve) => {
    fadeTimer = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / ms);
      player.volume = from * (1 - t) * (1 - t);
      if (t < 1) return;
      stopFade();
      player.pause();
      player.volume = from;
      emit({ status: 'paused' });
      resolve();
    }, 100);
  });
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export const getState = () => state;
