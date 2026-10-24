// Native modules the render tests can't load, replaced with inert stand-ins.
// Everything the app draws itself (screens, Zen Mode, navigation, layout)
// renders for real; Reanimated uses its official Jest mock, where animated
// values land on their final value at once.
require('react-native-gesture-handler/jestSetup');
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
// Reanimated 4.7's native initializer registers a CSS event handler, which
// its JS fallback (what runs under Jest) throws on; under test it's a no-op.
require('react-native-reanimated/src/ReanimatedModule').ReanimatedModule.setCSSEventHandler = () => {};
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// Audio: an in-memory engine with the same API as src/audio/engine.native.js.
jest.mock('./src/audio/engine', () => {
  let state = { status: 'idle', title: null, rate: 1, retry: 0, position: 0, duration: 0 };
  const subs = new Set();
  const emit = (patch) => {
    state = { ...state, ...patch };
    subs.forEach((fn) => fn(state));
  };
  return {
    MAX_RETRIES: 2,
    supportsTrackTitles: false,
    play: jest.fn(() => emit({ status: 'playing' })),
    pause: jest.fn(async () => emit({ status: 'paused' })),
    seek: jest.fn(async () => {}),
    skip: jest.fn(),
    setRate: jest.fn(async () => {}),
    subscribe: (fn) => {
      subs.add(fn);
      fn(state);
      return () => subs.delete(fn);
    },
    setRemoteControls: jest.fn(),
  };
});

// Network: fixed stations instead of live directories.
jest.mock('./src/api/radio', () => {
  const actual = jest.requireActual('./src/api/radio');
  const station = (n) => ({
    kind: 'radio',
    id: `test-${n}`,
    name: `Test Station ${n}`,
    streamUrl: `https://example.com/${n}.mp3`,
    logo: null,
    country: 'Ghana',
    countryCode: 'GH',
    tags: ['afrobeats'],
    bitrate: 128,
  });
  const list = [1, 2, 3, 4, 5].map(station);
  return {
    ...actual,
    fetchStationsByTag: jest.fn(() => Promise.resolve(list)),
    fetchTier1Stations: jest.fn(() => Promise.resolve(list)),
    streamPlays: jest.fn(() => Promise.resolve(true)),
  };
});
jest.mock('./src/api/nowPlaying', () => ({ fetchNowPlaying: jest.fn(() => Promise.resolve(null)) }));
jest.mock('./src/api/icy', () => ({ fetchTrackMetadata: jest.fn(() => Promise.resolve(null)) }));
jest.mock('react-native-image-colors', () => ({ getColors: jest.fn(() => Promise.resolve({ platform: 'android', dominant: '#B9792A' })) }));
jest.mock('react-native-youtube-iframe', () => () => null);
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(),
}));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
  hide: jest.fn(),
  setOptions: jest.fn(),
}));
jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  loadAsync: jest.fn(() => Promise.resolve()),
  isLoaded: () => true,
  isLoading: () => false,
}));
global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('') }));
