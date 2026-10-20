import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  State,
} from 'react-native-track-player';

let current = null;
let state = { status: 'idle', title: null };
let ready = null;
const listeners = new Set();

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
          capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
          compactCapabilities: [Capability.Play, Capability.Pause],
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
        // ICY StreamTitle arrives as timed metadata; ID3/common tags as common.
        TrackPlayer.addEventListener(Event.MetadataTimedReceived, ({ metadata }) => {
          const title = metadata?.[0] && trackTitle(metadata[0]);
          if (title) emit({ title });
        });
        TrackPlayer.addEventListener(Event.MetadataCommonReceived, ({ metadata }) => {
          const title = metadata && trackTitle(metadata);
          if (title) emit({ title });
        });
      });
  }
  return ready;
}

export async function play(station) {
  const switching = current?.id !== station.id;
  current = station;
  emit({ status: 'loading', ...(switching && { title: null }) });
  try {
    await setup();
    // Re-adding the track on resume puts a live stream back at "now".
    await TrackPlayer.reset();
    await TrackPlayer.add({
      id: station.id,
      url: station.streamUrl,
      title: station.name,
      artist: 'BOA Radio',
      artwork: station.logo || undefined,
      isLiveStream: true,
    });
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

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export const supportsTrackTitles = true;
