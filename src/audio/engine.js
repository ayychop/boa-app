// Web audio engine: a single HTML5 <audio> element.
// The native build resolves engine.native.js (react-native-track-player)
// instead; both expose the same play / pause / subscribe interface.

let audio = null;
let current = null;
let state = { status: 'idle', title: null };
let stopping = false;
let connectTimer = null;
const listeners = new Set();

// Some streams never send data and never error either; don't spin forever.
const CONNECT_TIMEOUT_MS = 15000;

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
  audio.addEventListener('error', () => {
    // Clearing src on pause fires a harmless error; ignore that one.
    if (stopping || !audio.getAttribute('src')) return;
    emit({ status: 'error' });
  });
  return audio;
}

function setMediaSession(station) {
  const ms = typeof navigator !== 'undefined' && navigator.mediaSession;
  if (!ms || typeof window.MediaMetadata === 'undefined') return;
  ms.metadata = new window.MediaMetadata({
    title: station.name,
    artist: 'BOA Radio',
    artwork: station.logo ? [{ src: station.logo, sizes: '512x512' }] : [],
  });
  ms.setActionHandler('play', () => current && play(current));
  ms.setActionHandler('pause', pause);
}

export function play(station) {
  const el = getAudio();
  if (!el) return;
  const switching = current?.id !== station.id;
  current = station;
  stopping = false;
  // Always (re)attach the source: resuming a live stream should jump to "now",
  // not replay whatever was buffered before pausing.
  el.src = station.streamUrl;
  emit({ status: 'loading', ...(switching && { title: null }) });
  setMediaSession(station);
  clearTimeout(connectTimer);
  connectTimer = setTimeout(() => {
    if (state.status !== 'loading') return;
    stopAudio();
    emit({ status: 'error' });
  }, CONNECT_TIMEOUT_MS);
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
  stopAudio();
  emit({ status: 'paused' });
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

// Browsers can't read ICY track metadata from cross-origin streams, so
// state.title stays null on web.
export const supportsTrackTitles = false;
