import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

// Native audio engine: a single expo-audio player. Items are live radio
// ({ kind: 'radio' }) or on-demand audio such as podcast episodes
// ({ kind: 'podcast' }); see engine.js for the shared contract.
let player = null;
let ready = null;
let current = null;
let state = { status: 'idle', title: null, position: 0, duration: 0, rate: 1, retry: 0 };
let attempts = 0;
let failedGen = -1;
let connectTimer = null;
let retryTimer = null;
let gen = 0; // see engine.js: guards against stale failures
const listeners = new Set();

// Some streams never send data and never error either; don't spin forever.
const CONNECT_TIMEOUT_MS = 9000;
// Self-healing: quietly reconnect this many times before telling the user.
export const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [1200, 2500];

const isLive = (item) => item?.kind !== 'podcast';

function emit(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

function onStatus(s) {
  // Only while we're trying to play; a stale error after pause is ignored.
  if (s.error) {
    if (state.status !== 'loading' && state.status !== 'playing') return;
    console.warn(`[audio] playback error for ${current?.streamUrl}: ${s.error}`);
    return fail(gen);
  }
  if (!isLive(current)) {
    emit({ position: s.currentTime, ...(s.duration > 0 && { duration: s.duration }) });
  }
  if (s.didJustFinish) return emit({ status: 'ended', position: state.duration });
  if (s.playing && !s.isBuffering) {
    if (state.status !== 'playing') {
      clearTimeout(connectTimer);
      attempts = 0;
      emit({ status: 'playing', retry: 0 });
    }
  } else if (s.isBuffering && state.status === 'playing') {
    emit({ status: 'loading' });
  } else if (!s.playing && !s.isBuffering && state.status === 'playing') {
    // Paused from outside the app: lock screen, headset, audio focus loss.
    emit({ status: 'paused' });
  }
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

// See engine.js: retry quietly, then surface "error".
function fail(attempt) {
  // One failure per attempt: some players report the same failure twice.
  if (attempt !== gen || attempt === failedGen || !current) return;
  failedGen = attempt;
  clearTimeout(connectTimer);
  player?.pause();
  if (attempts < MAX_RETRIES) {
    attempts += 1;
    emit({ status: 'loading', retry: attempts });
    const item = current;
    const resumeAt = isLive(item) ? 0 : state.position;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => connect(item, { retry: true, resumeAt }), RETRY_DELAYS_MS[attempts - 1]);
  } else {
    emit({ status: 'error', retry: 0 });
  }
}

/** User-initiated play: resets the retry budget. */
export function play(item) {
  clearTimeout(retryTimer);
  attempts = 0;
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
  // Lock-screen controls are a nicety; never let them stop playback.
  try {
    player.setActiveForLockScreen(
      true,
      { title: item.name, artist: item.artist || 'BOA Radio', artworkUrl: item.logo || undefined },
      { showSeekForward: !isLive(item), showSeekBackward: !isLive(item) },
    );
  } catch (err) {
    console.warn('[audio] lock screen controls unavailable', err);
  }
}

export async function pause() {
  clearTimeout(retryTimer);
  clearTimeout(connectTimer);
  attempts = 0;
  gen += 1;
  emit({ status: 'paused', retry: 0 });
  player?.pause();
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

// expo-audio doesn't surface ICY stream titles, so state.title stays null;
// the UI gets them from useNowPlaying (api/nowPlaying.js + api/icy.js).
export const supportsTrackTitles = false;
