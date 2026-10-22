// Web audio engine: a single HTML5 <audio> element.
// The native build resolves engine.native.js (expo-audio)
// instead; both expose the same interface.
//
// Items are either live radio ({ kind: 'radio', streamUrl }) or on-demand
// audio such as podcast episodes ({ kind: 'podcast', streamUrl }).

let audio = null;
let current = null;
let state = { status: 'idle', title: null, position: 0, duration: 0, rate: 1, retry: 0 };
let stopping = false;
let connectTimer = null;
let retryTimer = null;
let attempts = 0;
let failedGen = -1;
// Bumped on every connection attempt so a late failure from an earlier
// attempt (or an earlier station) can never trigger a retry for this one.
let gen = 0;
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

function getAudio() {
  if (audio || typeof window === 'undefined') return audio;
  audio = new window.Audio();
  audio.preload = 'none';
  audio.addEventListener('playing', () => {
    clearTimeout(connectTimer);
    attempts = 0;
    emit({ status: 'playing', retry: 0 });
  });
  audio.addEventListener('waiting', () => !audio.paused && emit({ status: 'loading' }));
  audio.addEventListener('timeupdate', () => {
    if (!isLive(current)) emit({ position: audio.currentTime });
  });
  audio.addEventListener('durationchange', () => {
    if (!isLive(current) && Number.isFinite(audio.duration)) emit({ duration: audio.duration });
  });
  audio.addEventListener('ended', () => emit({ status: 'ended', position: state.duration }));
  audio.addEventListener('error', () => {
    // Clearing src on pause fires a harmless error; ignore that one.
    if (stopping || !audio.getAttribute('src')) return;
    fail(gen);
  });
  return audio;
}

function setMediaSession(item) {
  const ms = typeof navigator !== 'undefined' && navigator.mediaSession;
  if (!ms || typeof window.MediaMetadata === 'undefined') return;
  ms.metadata = new window.MediaMetadata({
    title: item.name,
    artist: item.artist || 'BOA Radio',
    artwork: item.logo ? [{ src: item.logo, sizes: '512x512' }] : [],
  });
  ms.setActionHandler('play', () => current && play(current));
  ms.setActionHandler('pause', pause);
  const onDemand = !isLive(item);
  ms.setActionHandler('seekbackward', onDemand ? () => skip(-15) : null);
  ms.setActionHandler('seekforward', onDemand ? () => skip(30) : null);
}

function armConnectTimeout(attempt) {
  clearTimeout(connectTimer);
  connectTimer = setTimeout(() => {
    if (state.status === 'loading') fail(attempt);
  }, CONNECT_TIMEOUT_MS);
}

// A connection attempt failed. Retry quietly (status stays "loading", with
// `retry` = attempt number for the UI) until MAX_RETRIES, then give up with
// "error"; the user can still tap to try again.
function fail(attempt) {
  // One failure per attempt: some players report the same failure twice.
  if (attempt !== gen || attempt === failedGen || !current) return;
  failedGen = attempt;
  clearTimeout(connectTimer);
  stopAudio();
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
  connect(item, {});
}

function connect(item, { retry = false, resumeAt = 0 }) {
  const el = getAudio();
  if (!el) return;
  const attempt = ++gen;
  const switching = current?.id !== item.id;
  current = item;
  stopping = false;

  if (switching || retry || isLive(item) || !el.getAttribute('src')) {
    // Live: always reattach so resuming jumps to "now" rather than replaying
    // the buffer. On-demand: only when the item changes (or on a retry).
    el.src = item.streamUrl;
    el.playbackRate = isLive(item) ? 1 : state.rate;
    if (resumeAt > 0) el.addEventListener('loadedmetadata', () => (el.currentTime = resumeAt), { once: true });
  }
  if (retry) {
    // Keep showing "reconnecting" (set in fail()); don't reset the episode.
  } else if (switching) {
    emit({ status: 'loading', title: null, position: 0, duration: item.duration || 0, retry: 0 });
  } else if (state.status === 'ended') {
    el.currentTime = 0;
    emit({ status: 'loading', position: 0, retry: 0 });
  } else {
    emit({ status: 'loading', retry: 0 });
  }
  setMediaSession(item);
  armConnectTimeout(attempt);
  el.play().catch((err) => {
    if (err?.name === 'AbortError') return; // superseded by a newer play/pause
    fail(attempt);
  });
}

function stopAudio() {
  const el = getAudio();
  if (!el) return;
  clearTimeout(connectTimer);
  stopping = true;
  el.pause();
  // Drop the connection so we stop downloading the stream while paused.
  el.removeAttribute('src');
  el.load();
}

export function pause() {
  const el = getAudio();
  if (!el) return;
  // A pause cancels any reconnect in flight.
  clearTimeout(retryTimer);
  attempts = 0;
  gen += 1;
  if (isLive(current)) stopAudio();
  else {
    clearTimeout(connectTimer);
    el.pause();
  }
  emit({ status: 'paused', retry: 0 });
}

export function seek(seconds) {
  const el = getAudio();
  if (!el || isLive(current)) return;
  const t = Math.max(0, Math.min(seconds, state.duration || seconds));
  el.currentTime = t;
  emit({ position: t, ...(state.status === 'ended' && { status: 'paused' }) });
}

export function skip(delta) {
  seek((getAudio()?.currentTime ?? state.position) + delta);
}

export function setRate(rate) {
  const el = getAudio();
  if (el && !isLive(current)) el.playbackRate = rate;
  emit({ rate });
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

// Browsers can't read ICY track metadata from cross-origin streams, so
// state.title stays null for live radio on web.
export const supportsTrackTitles = false;
