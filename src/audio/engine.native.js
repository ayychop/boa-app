import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  State,
} from 'react-native-track-player';

// Items are live radio ({ kind: 'radio' }) or on-demand audio such as podcast
// episodes ({ kind: 'podcast' }); see engine.js for the shared contract.
let current = null;
let state = { status: 'idle', title: null, position: 0, duration: 0, rate: 1 };
let ready = null;
const listeners = new Set();

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
          if (STATUS[s]) emit({ status: STATUS[s] });
        });
        TrackPlayer.addEventListener(Event.PlaybackError, () => emit({ status: 'error' }));
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

export async function play(item) {
  const switching = current?.id !== item.id;
  current = item;
  if (switching) emit({ status: 'loading', title: null, position: 0, duration: item.duration || 0 });
  else emit({ status: 'loading' });
  try {
    await setup();
    if (!switching && !isLive(item)) {
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
    await TrackPlayer.play();
  } catch {
    emit({ status: 'error' });
  }
}

export async function pause() {
  emit({ status: 'paused' });
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
