// Web audio engine: a single HTML5 <audio> element.
// The native build resolves engine.native.js (react-native-track-player)
// instead; both expose the same interface.
//
// Items are either live radio ({ kind: 'radio', streamUrl }) or on-demand
// audio such as podcast episodes ({ kind: 'podcast', streamUrl }).

let audio = null;
let current = null;
let state = { status: 'idle', title: null, position: 0, duration: 0, rate: 1 };
let stopping = false;
let connectTimer = null;
const listeners = new Set();

// Some streams never send data and never error either; don't spin forever.
const CONNECT_TIMEOUT_MS = 15000;

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
    emit({ status: 'playing' });
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
    clearTimeout(connectTimer);
    emit({ status: 'error' });
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

function armConnectTimeout() {
  clearTimeout(connectTimer);
  connectTimer = setTimeout(() => {
    if (state.status !== 'loading') return;
    stopAudio();
    emit({ status: 'error' });
  }, CONNECT_TIMEOUT_MS);
}

export function play(item) {
  const el = getAudio();
  if (!el) return;
  const switching = current?.id !== item.id;
  current = item;
  stopping = false;

  if (switching || isLive(item) || !el.getAttribute('src')) {
    // Live: always reattach so resuming jumps to "now" rather than replaying
    // the buffer. On-demand: only when the item changes.
    el.src = item.streamUrl;
    el.playbackRate = isLive(item) ? 1 : state.rate;
  }
  if (switching) {
    emit({ status: 'loading', title: null, position: 0, duration: item.duration || 0 });
  } else if (state.status === 'ended') {
    el.currentTime = 0;
    emit({ status: 'loading', position: 0 });
  } else {
    emit({ status: 'loading' });
  }
  setMediaSession(item);
  armConnectTimeout();
  el.play().catch((err) => {
    if (err?.name === 'AbortError') return; // superseded by a newer play/pause
    clearTimeout(connectTimer);
    emit({ status: 'error' });
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
  if (isLive(current)) stopAudio();
  else {
    clearTimeout(connectTimer);
    el.pause();
  }
  emit({ status: 'paused' });
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
