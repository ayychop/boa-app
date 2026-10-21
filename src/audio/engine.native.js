import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  State,
} from 'react-native-track-player';

// Items are live radio ({ kind: 'radio' }) or on-demand audio such as podcast
// episodes ({ kind: 'podcast' }); see engine.js for the shared contract.
let current = null;
let state = { status: 'idle', title: null, position: 0, duration: 0, rate: 1, retry: 0 };
let ready = null;
let attempts = 0;
let failedGen = -1;
let retryTimer = null;
let gen = 0; // see engine.js: guards against stale failures
const listeners = new Set();

// Self-healing: quietly reconnect this many times before telling the user.
export const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [1200, 2500];

const isLive = (item) => item?.kind !== 'podcast';

function emit(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

const STATUS = {
  [State.Playing]: 'playing',
  [State.Loading]: 'loading',
  [State.Buffering]: 'loading',
  [State.Paused]: 'paused',
  [State.Stopped]: 'paused',
  [State.Ended]: 'ended',
  [State.Error]: 'error',
};

function trackTitle({ title, artist }) {
  if (!title) return null;
  return artist && !title.includes(artist) ? `${artist} — ${title}` : title;
}

function setup() {
  if (!ready) {
    ready = TrackPlayer.setupPlayer({ autoHandleInterruptions: true })
      .catch((err) => {
        // Fast refresh re-runs this module while the native player lives on.
        if (!String(err?.message).includes('already been initialized')) throw err;
      })
      .then(() =>
        TrackPlayer.updateOptions({
          capabilities: [Capability.Play, Capability.Pause, Capability.Stop, Capability.SeekTo, Capability.JumpForward, Capability.JumpBackward],
          compactCapabilities: [Capability.Play, Capability.Pause],
          forwardJumpInterval: 30,
          backwardJumpInterval: 15,
          progressUpdateEventInterval: 1,
          android: {
            appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          },
        }),
      )
      .then(() => {
        TrackPlayer.addEventListener(Event.PlaybackState, ({ state: s }) => {
          if (s === State.Error) return fail(gen); // handled by the retry path
          if (s === State.Playing) attempts = 0;
          // While reconnecting, keep showing "loading" rather than a flash of
          // "paused"/"stopped" from the reset between attempts.
          if (STATUS[s] && !(state.retry && STATUS[s] === 'paused')) emit({ status: STATUS[s], ...(s === State.Playing && { retry: 0 }) });
        });
        TrackPlayer.addEventListener(Event.PlaybackError, () => fail(gen));
        TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, ({ position, duration }) => {
          if (!isLive(current)) emit({ position, ...(duration > 0 && { duration }) });
        });
        // ICY StreamTitle arrives as timed metadata; ID3/common tags as common.
        TrackPlayer.addEventListener(Event.MetadataTimedReceived, ({ metadata }) => {
          const title = isLive(current) && metadata?.[0] && trackTitle(metadata[0]);
          if (title) emit({ title });
        });
        TrackPlayer.addEventListener(Event.MetadataCommonReceived, ({ metadata }) => {
          const title = isLive(current) && metadata && trackTitle(metadata);
          if (title) emit({ title });
        });
      });
  }
  return ready;
}

// See engine.js: retry quietly, then surface "error".
function fail(attempt) {
  // One failure per attempt: some players report the same failure twice.
  if (attempt !== gen || attempt === failedGen || !current) return;
  failedGen = attempt;
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
  try {
    await setup();
    if (!switching && !retry && !isLive(item)) {
      if (state.status === 'ended') await TrackPlayer.seekTo(0);
      await TrackPlayer.play();
      return;
    }
    // Re-adding a live track on resume puts it back at "now".
    await TrackPlayer.reset();
    await TrackPlayer.add({
      id: item.id,
      url: item.streamUrl,
      title: item.name,
      artist: item.artist || 'BOA Radio',
      artwork: item.logo || undefined,
      isLiveStream: isLive(item),
    });
    if (!isLive(item)) await TrackPlayer.setRate(state.rate);
    if (resumeAt > 0) await TrackPlayer.seekTo(resumeAt);
    await TrackPlayer.play();
  } catch {
    fail(attempt);
  }
}

export async function pause() {
  clearTimeout(retryTimer);
  attempts = 0;
  gen += 1;
  emit({ status: 'paused', retry: 0 });
  await setup();
  await TrackPlayer.pause();
}

export async function seek(seconds) {
  if (isLive(current)) return;
  const t = Math.max(0, Math.min(seconds, state.duration || seconds));
  emit({ position: t });
  await TrackPlayer.seekTo(t);
}

export function skip(delta) {
  return seek(state.position + delta);
}

export async function setRate(rate) {
  emit({ rate });
  if (!isLive(current)) await TrackPlayer.setRate(rate);
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export const supportsTrackTitles = true;
