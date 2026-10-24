import { AppState, Platform } from 'react-native';
import { createAudioPlayer, requestNotificationPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { splitTrack } from '../utils/track';
import * as focus from './focus';

export { splitTrack };

// Native audio engine: a single expo-audio player. Items are live radio
// ({ kind: 'radio' }) or on-demand audio such as podcast episodes
// ({ kind: 'podcast' }); see engine.js for the shared contract.
//
// Plays until the listener stops it. Once a stream has played, any drop
// (an error, the server closing the stream, a stall, a network gap) is
// reconnected on a backoff for as long as the listener still wants it
// playing. A station that never starts gets MAX_RETRIES quick retries and
// then reports "error", so dead stations are still found.
let player = null;
let ready = null;
let current = null;
let state = { status: 'idle', title: null, position: 0, duration: 0, rate: 1, retry: 0 };
// The listener's intent: true from play() until pause(), a final error, or a
// pause from outside the app (lock screen, headset, losing audio focus).
let wantPlaying = false;
// The current item has played this session, so a failure is a drop to
// reconnect rather than a dead station.
let established = false;
let attempts = 0;
let failedGen = -1;
let connectTimer = null;
let stallTimer = null;
let retryTimer = null;
let gen = 0; // see engine.js: guards against stale failures
const listeners = new Set();
let remote = null; // { next, previous } from the player context

// Some streams never send data and never error either; don't spin forever.
const CONNECT_TIMEOUT_MS = 9000;
// Playing, then buffering this long without recovering: reconnect.
const STALL_TIMEOUT_MS = 12000;
// Self-healing for a station that hasn't started yet: this many quick
// retries before telling the user.
export const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [1200, 2500];
// Reconnecting a stream that was playing: keeps trying, backing off to a
// retry every 30s (a tunnel, a lift, a dead zone).
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 30000];

const isLive = (item) => item?.kind !== 'podcast';

function emit(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

function clearTimers() {
  clearTimeout(connectTimer);
  clearTimeout(stallTimer);
  clearTimeout(retryTimer);
  retryTimer = null;
}

function onStatus(s) {
  if (!current) return;
  if (s.error) {
    if (!wantPlaying) return; // a stale error after pause
    console.warn(`[audio] playback error for ${current.streamUrl}: ${s.error}`);
    return fail(gen);
  }
  if (!isLive(current)) {
    emit({ position: s.currentTime, ...(s.duration > 0 && { duration: s.duration }) });
  }
  if (s.didJustFinish || (s.playbackState === 'ended' && state.status === 'playing')) {
    // A live stream "ending" is the server dropping the connection.
    if (isLive(current)) return wantPlaying ? fail(gen) : undefined;
    wantPlaying = false;
    return emit({ status: 'ended', position: state.duration });
  }
  if (s.playing && !s.isBuffering) {
    clearTimeout(stallTimer);
    if (state.status !== 'playing') {
      clearTimeout(connectTimer);
      attempts = 0;
      established = true;
      // Also covers play from the lock screen, headset or car.
      wantPlaying = true;
      emit({ status: 'playing', retry: 0 });
    }
    return;
  }
  if (s.isBuffering || s.playbackState === 'buffering') {
    if (state.status === 'playing') {
      emit({ status: 'loading' });
      armStallTimeout(gen);
    }
    return;
  }
  if (state.status !== 'playing') return;
  if (s.playbackState === 'idle' && wantPlaying) {
    // Dropped to idle without an error: the stream went away.
    return fail(gen);
  }
  // Ready but not playing: paused from outside the app (lock screen,
  // headset, audio focus). That's the listener's choice.
  wantPlaying = false;
  clearTimers();
  emit({ status: 'paused' });
}

// Android drops play() without a word while the phone is on silent/vibrate
// unless playsInSilentMode is already set, so the mode must land first.
function getPlayer() {
  if (!ready) {
    ready = setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    })
      .catch((err) => console.warn('[audio] setAudioModeAsync failed', err))
      .then(() => {
        player = createAudioPlayer(null, { updateInterval: 1000 });
        player.addListener('playbackStatusUpdate', onStatus);
        // Next/previous from the lock screen, notification, headset or car.
        player.addListener('remoteNextTrack', () => remote?.next?.());
        player.addListener('remotePreviousTrack', () => remote?.previous?.());
        // Back in the app while waiting to reconnect: try straight away.
        AppState.addEventListener('change', (next) => {
          if (next !== 'active') return;
          if (pendingLockScreen && pendingLockScreen === current) showOnLockScreen(pendingLockScreen);
          if (wantPlaying && retryTimer && current) {
            clearTimeout(retryTimer);
            retryTimer = null;
            connect(current, { retry: true, resumeAt: isLive(current) ? 0 : state.position });
          }
        });
        return player;
      });
  }
  return ready;
}

function armConnectTimeout(attempt) {
  clearTimeout(connectTimer);
  connectTimer = setTimeout(() => {
    if (state.status !== 'loading') return;
    console.warn(`[audio] no audio from ${current?.streamUrl} after ${CONNECT_TIMEOUT_MS / 1000}s`);
    fail(attempt);
  }, CONNECT_TIMEOUT_MS);
}

function armStallTimeout(attempt) {
  clearTimeout(stallTimer);
  stallTimer = setTimeout(() => {
    if (state.status !== 'loading' || !wantPlaying) return;
    console.warn(`[audio] ${current?.streamUrl} stalled for ${STALL_TIMEOUT_MS / 1000}s; reconnecting`);
    fail(attempt);
  }, STALL_TIMEOUT_MS);
}

// One failure per attempt: some players report the same failure twice.
function fail(attempt) {
  if (attempt !== gen || attempt === failedGen || !current || !wantPlaying) return;
  failedGen = attempt;
  clearTimers();
  player?.pause();
  if (established || attempts < MAX_RETRIES) {
    attempts += 1;
    emit({ status: 'loading', retry: attempts });
    const item = current;
    const resumeAt = isLive(item) ? 0 : state.position;
    const delay = established
      ? RECONNECT_DELAYS_MS[Math.min(attempts, RECONNECT_DELAYS_MS.length) - 1]
      : RETRY_DELAYS_MS[attempts - 1];
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect(item, { retry: true, resumeAt });
    }, delay);
  } else {
    wantPlaying = false;
    emit({ status: 'error', retry: 0 });
  }
}

/** User-initiated play: resets the retry budget. */
export function play(item) {
  // The radio takes over from a Zen soundscape.
  focus.claim('radio');
  clearTimers();
  attempts = 0;
  established = false;
  wantPlaying = true;
  return connect(item, {});
}

async function connect(item, { retry = false, resumeAt = 0 }) {
  const attempt = ++gen;
  const switching = current?.id !== item.id;
  current = item;
  if (retry) {
    // status already shows the reconnect attempt
  } else if (switching) emit({ status: 'loading', title: null, position: 0, duration: item.duration || 0, retry: 0 });
  else emit({ status: 'loading', retry: 0 });
  if (!/^https?:\/\//i.test(item.streamUrl || '')) {
    console.warn(`[audio] not an http(s) stream: ${item.streamUrl}`);
    failedGen = attempt;
    wantPlaying = false;
    return emit({ status: 'error', retry: 0 });
  }
  try {
    armConnectTimeout(attempt);
    const p = await getPlayer();
    if (attempt !== gen) return; // paused or switched while setting up
    if (!switching && !retry && !isLive(item)) {
      if (state.status === 'ended') await p.seekTo(0);
      p.play();
      return;
    }
    // Reloading a live stream on resume puts it back at "now".
    p.replace({ uri: item.streamUrl });
    p.setPlaybackRate(isLive(item) ? 1 : state.rate);
    if (resumeAt > 0) await p.seekTo(resumeAt);
    p.play();
  } catch (err) {
    console.warn(`[audio] couldn't start ${item.streamUrl}`, err);
    return fail(attempt);
  }
  showOnLockScreen(item);
}

// Lock-screen controls (Android's media notification, which also keeps
// playback alive in the background). Switching them on can start a service,
// and Android throws, natively and uncatchably from here, if an app starts a
// service while it's in the background. So they are only ever switched on
// while the app is in the foreground. In the background (a reconnect, or
// next/previous from the lock screen) the existing controls just get the
// new metadata, or wait for the app to come back.
let lockScreenOn = false;
let pendingLockScreen = null;
let askedForNotifications = false;

// Spotify-style lock screen: the song as the title and the station as the
// artist once the stream says what's on ("Artist - Title" splits into both),
// the station and "BOA Radio" until then; BOA Networks as the album; and a
// record with the station's logo as its label for the artwork (rendered on
// the device, see components/RecordArtwork.js), else the bare logo.
let nowPlaying = null; // { id, text }
const artworkById = new Map(); // station id -> file:// uri of its record art


export function lockScreenMetadata(item) {
  const live = isLive(item);
  const track = nowPlaying?.id === item.id ? nowPlaying.text : null;
  const split = splitTrack(track);
  let title = item.name;
  let artist = item.artist || 'BOA Radio';
  if (live && split) {
    title = split.title;
    artist = `${split.artist} · ${item.name}`;
  } else if (live && track) {
    title = track;
    artist = item.name;
  } else if (live) {
    artist = 'BOA Radio · Live';
  }
  return {
    title,
    artist,
    albumTitle: 'BOA Networks',
    artworkUrl: artworkById.get(item.id) || item.logo || undefined,
  };
}

function refreshLockScreen() {
  if (!player || !current || !lockScreenOn) return;
  try {
    player.updateLockScreenMetadata(lockScreenMetadata(current));
  } catch (err) {
    console.warn('[audio] lock screen update failed', err);
  }
}

/** The track a station is playing, for the lock screen (null when unknown). */
export function setNowPlaying(id, text) {
  if (nowPlaying?.id === id && nowPlaying?.text === text) return;
  nowPlaying = { id, text: text || null };
  if (current?.id === id) refreshLockScreen();
}

/** A rendered record image (file:// uri) to show on the lock screen. */
export function setArtwork(id, uri) {
  if (!uri || artworkById.get(id) === uri) return;
  artworkById.set(id, uri);
  if (current?.id === id) refreshLockScreen();
}

function showOnLockScreen(item) {
  if (!player) return;
  try {
    if (AppState.currentState === 'active') {
      pendingLockScreen = null;
      const live = isLive(item);
      player.setActiveForLockScreen(true, lockScreenMetadata(item), {
        isLiveStream: live,
        showSeekForward: !live,
        showSeekBackward: !live,
        // Previous/next station for radio, from the lock screen, the
        // notification, headsets and cars.
        showNextTrack: live && !!remote,
        showPreviousTrack: live && !!remote,
      });
      lockScreenOn = true;
      askForNotifications();
    } else if (lockScreenOn) {
      player.updateLockScreenMetadata(lockScreenMetadata(item));
    } else {
      pendingLockScreen = item;
    }
  } catch (err) {
    // A nicety; never let it stop playback.
    console.warn('[audio] lock screen controls unavailable', err);
  }
}

// Android 13+ only shows the media notification with permission. Asked once,
// in the foreground, after playback has started; the answer never blocks it.
function askForNotifications() {
  if (askedForNotifications || Platform.OS !== 'android' || Platform.Version < 33) return;
  askedForNotifications = true;
  requestNotificationPermissionsAsync().catch(() => {});
}

export async function pause() {
  clearTimers();
  attempts = 0;
  wantPlaying = false;
  gen += 1;
  emit({ status: 'paused', retry: 0 });
  player?.pause();
}

/**
 * Fades playback out over `ms` (ease-out), then pauses and restores the
 * volume. Used by the sleep timer so the music drifts off rather than cuts.
 */
export function fadeOut(ms = 30000) {
  if (!player || !wantPlaying) return Promise.resolve(pause());
  const started = Date.now();
  return new Promise((resolve) => {
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - started) / ms);
      if (!wantPlaying) {
        clearInterval(id);
        player.volume = 1;
        return resolve();
      }
      player.volume = (1 - t) * (1 - t);
      if (t < 1) return;
      clearInterval(id);
      pause();
      player.volume = 1;
      resolve();
    }, 100);
  });
}

export async function seek(seconds) {
  if (!player || isLive(current)) return;
  const t = Math.max(0, Math.min(seconds, state.duration || seconds));
  emit({ position: t, ...(state.status === 'ended' && { status: 'paused' }) });
  await player.seekTo(t);
}

export function skip(delta) {
  return seek(state.position + delta);
}

export async function setRate(rate) {
  emit({ rate });
  if (player && !isLive(current)) player.setPlaybackRate(rate);
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

/** Handlers for next/previous station from outside the app. */
export function setRemoteControls(handlers) {
  remote = handlers;
}

// expo-audio doesn't surface ICY stream titles, so state.title stays null;
// the UI gets them from useNowPlaying (api/nowPlaying.js + api/icy.js).
export const supportsTrackTitles = false;

// A Zen soundscape starting pauses the radio at once.
focus.register('radio', () => {
  if (state.status === 'playing' || state.status === 'loading') pause();
});
