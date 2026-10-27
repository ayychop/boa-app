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
  const focus = jest.requireActual('./src/audio/focus');
  let state = { status: 'idle', title: null, rate: 1, retry: 0, position: 0, duration: 0 };
  const subs = new Set();
  const emit = (patch) => {
    state = { ...state, ...patch };
    subs.forEach((fn) => fn(state));
  };
  const pause = jest.fn(async () => emit({ status: 'paused' }));
  // Like the real engines: one sound at a time (src/audio/focus.js).
  focus.register('radio', () => {
    if (state.status === 'playing' || state.status === 'loading') pause();
  });
  return {
    MAX_RETRIES: 2,
    supportsTrackTitles: false,
    play: jest.fn(() => {
      focus.claim('radio');
      emit({ status: 'playing' });
    }),
    pause,
    seek: jest.fn(async () => {}),
    skip: jest.fn(),
    setRate: jest.fn(async () => {}),
    subscribe: (fn) => {
      subs.add(fn);
      fn(state);
      return () => subs.delete(fn);
    },
    setRemoteControls: jest.fn(),
    getCurrent: jest.fn(() => null),
    fadeOut: jest.fn(async () => emit({ status: 'paused' })),
    setNowPlaying: jest.fn(),
    setArtwork: jest.fn(),
  };
});

// expo-audio: in-memory players that record what the app asks of them, so
// tests can check sources, looping, volume and lock screen metadata.
jest.mock('expo-audio', () => {
  const players = [];
  const createAudioPlayer = jest.fn((source) => {
    const listeners = {};
    const player = {
      source,
      loop: false,
      volume: 1,
      playing: false,
      play: jest.fn(() => {
        player.playing = true;
      }),
      pause: jest.fn(() => {
        player.playing = false;
      }),
      remove: jest.fn(() => {
        player.playing = false;
        player.removed = true;
      }),
      replace: jest.fn((next) => {
        player.source = next;
      }),
      seekTo: jest.fn(async () => {}),
      setPlaybackRate: jest.fn(),
      setActiveForLockScreen: jest.fn(),
      updateLockScreenMetadata: jest.fn(),
      addListener: jest.fn((event, fn) => {
        (listeners[event] ??= []).push(fn);
        return { remove: jest.fn() };
      }),
      emit: (event, payload) => (listeners[event] ?? []).forEach((fn) => fn(payload)),
    };
    players.push(player);
    return player;
  });
  // Voice notes: a recorder that "records" to a fixed file, and hook
  // players built on the same fakes.
  const recorder = {
    uri: null,
    isRecording: false,
    prepareToRecordAsync: jest.fn(async () => {}),
    record: jest.fn(() => {
      recorder.isRecording = true;
    }),
    stop: jest.fn(async () => {
      recorder.isRecording = false;
      recorder.uri = 'file:///cache/voice-note.m4a';
    }),
  };
  return {
    createAudioPlayer,
    useAudioPlayer: jest.fn((source) => {
      const React = require('react');
      const ref = React.useRef(null);
      if (!ref.current) ref.current = createAudioPlayer(source);
      return ref.current;
    }),
    useAudioPlayerStatus: jest.fn((player) => ({ playing: !!player?.playing, currentTime: 0, duration: 0, didJustFinish: false })),
    useAudioRecorder: jest.fn(() => recorder),
    useAudioRecorderState: jest.fn(() => ({ isRecording: recorder.isRecording, durationMillis: recorder.isRecording ? 4200 : 0, metering: -20 })),
    RecordingPresets: { HIGH_QUALITY: { extension: '.m4a', sampleRate: 44100 } },
    requestRecordingPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
    requestNotificationPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
    __players: players,
    __recorder: recorder,
  };
});

// expo-file-system: a fake cache directory; downloads "succeed" unless a
// test says otherwise, and remember what was fetched with which headers.
jest.mock('expo-file-system', () => {
  const files = new Map(); // uri -> size
  const bytes = new Map(); // uri -> first bytes, for images
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d];
  const join = (...parts) => parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  class Directory {
    constructor(...parts) {
      this.uri = join(...parts);
    }
    get exists() {
      return true;
    }
    create() {}
  }
  class File {
    constructor(...parts) {
      this.uri = join(...parts);
    }
    get exists() {
      return files.has(this.uri);
    }
    get size() {
      return files.get(this.uri) ?? 0;
    }
    bytesSync() {
      return new Uint8Array(bytes.get(this.uri) ?? []);
    }
    delete() {
      files.delete(this.uri);
      bytes.delete(this.uri);
    }
  }
  // Images (station logos) arrive as a real-sized PNG.
  File.downloadFileAsync = jest.fn(async (url, dest) => {
    const image = /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);
    files.set(dest.uri, image ? 8192 : 1024);
    if (image) bytes.set(dest.uri, PNG);
    return dest;
  });
  return { Directory, File, Paths: { cache: { uri: 'file:///cache' } }, __files: files };
});

// expo-video: a fake player per hook call, recording source, looping and
// play state; the view is a plain View.
jest.mock('expo-video', () => {
  const React = require('react');
  const { View } = require('react-native');
  const players = [];
  const make = (source) => {
    const p = {
      source,
      loop: false,
      muted: false,
      audioMixingMode: 'auto',
      playing: false,
      replace: jest.fn((next) => {
        p.source = next;
      }),
      play: jest.fn(() => {
        p.playing = true;
      }),
      pause: jest.fn(() => {
        p.playing = false;
      }),
    };
    players.push(p);
    return p;
  };
  return {
    useVideoPlayer: (source, setup) => {
      const ref = React.useRef(null);
      if (!ref.current) {
        ref.current = make(source);
        setup?.(ref.current);
      }
      return ref.current;
    },
    VideoView: ({ player, testID, ...rest }) => React.createElement(View, { testID: testID ?? 'video-view', ...rest }),
    __players: players,
  };
});

// The home screen widget bridge (an Android native module in the app).
jest.mock('./modules/boa-widget', () => ({
  isAvailable: true,
  setStyle: jest.fn(() => Promise.resolve()),
  setLayout: jest.fn(() => Promise.resolve()),
  setFlipped: jest.fn(() => Promise.resolve()),
  setArtwork: jest.fn(() => Promise.resolve()),
  setWeather: jest.fn(() => Promise.resolve()),
  setNowPlaying: jest.fn(() => Promise.resolve()),
  count: jest.fn(() => Promise.resolve(1)),
}));

// The slider is a native view; a plain View that passes its value handler
// through, so tests can drag it with fireEvent(slider, 'valueChange', v).
jest.mock('@react-native-community/slider', () => {
  const React = require('react');
  const { View } = require('react-native');
  return (props) => React.createElement(View, { ...props, accessibilityRole: 'adjustable' });
});

jest.mock('react-native-view-shot', () => {
  let n = 0;
  return { captureRef: jest.fn(() => Promise.resolve(`file:///cache/record-${++n}.png`)) };
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
// The screen off/on broadcast (an Android native module in the app); tests
// fire it with __emit('off' | 'on').
jest.mock('./modules/boa-screen', () => {
  const listeners = new Set();
  return {
    isAvailable: true,
    addScreenListener: jest.fn((fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }),
    // The lock screen: unlocked unless a test says otherwise.
    isLocked: jest.fn(() => false),
    showOverLock: jest.fn(async () => true),
    unlock: jest.fn(async () => true),
    clearOverLock: jest.fn(async () => {}),
    // FLAG_SECURE (screenshots blocked) for view-once media.
    setSecure: jest.fn(async () => true),
    __emit: (state) => listeners.forEach((fn) => fn(state)),
  };
});

// Alarms: scheduled notifications, never actually delivered in tests.
jest.mock('expo-notifications', () => {
  const sub = () => ({ remove: jest.fn() });
  return {
    AndroidImportance: { MAX: 5, HIGH: 4 },
    AndroidNotificationPriority: { MAX: 'max' },
    AndroidNotificationVisibility: { PUBLIC: 1, PRIVATE: 0 },
    getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: 'ExponentPushToken[test]' })),
    AndroidAudioUsage: { ALARM: 4 },
    SchedulableTriggerInputTypes: { DATE: 'date', WEEKLY: 'weekly' },
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
    deleteNotificationChannelAsync: jest.fn(() => Promise.resolve()),
    getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false, canAskAgain: true })),
    requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
    scheduleNotificationAsync: jest.fn(() => Promise.resolve('notification-id')),
    cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
    addNotificationReceivedListener: jest.fn(sub),
    addNotificationResponseReceivedListener: jest.fn(sub),
  };
});

// Weather: location never granted unless a test says so.
jest.mock('expo-location', () => ({
  Accuracy: { Low: 2, Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false, status: 'undetermined', canAskAgain: true })),
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false, status: 'denied', canAskAgain: false })),
  getLastKnownPositionAsync: jest.fn(() => Promise.resolve(null)),
  getCurrentPositionAsync: jest.fn(() => Promise.resolve({ coords: { latitude: 5.6, longitude: -0.19 } })),
  reverseGeocodeAsync: jest.fn(() => Promise.resolve([{ city: 'Accra' }])),
}));

// The Creative Hub stays unconfigured, so tests never reach the real project
// even when .env.local is filled in.
jest.mock('./src/lib/supabase', () => ({ supabase: null, isConfigured: false, projectHost: null }));

global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]), text: () => Promise.resolve('') }));

// The welcome tour and "What's New" open as modals over the app once each;
// the app's render tests run without them (first-run.test.js covers them).
jest.mock('./src/components/FirstRun', () => () => null);

// Agora (video calls): one engine whose every method records its calls and
// succeeds, and video views that render as plain Views with their canvas.
jest.mock('react-native-agora', () => {
  const { View } = require('react-native');
  const engine = new Proxy(
    {},
    {
      get: (t, k) => {
        if (typeof k !== 'string' || k === 'then' || k === 'asymmetricMatch') return undefined;
        if (!(k in t)) t[k] = jest.fn(() => (k === 'registerEventHandler' ? true : 0));
        return t[k];
      },
    },
  );
  const RtcSurfaceView = (props) => <View {...props} />;
  return { __engine: engine, createAgoraRtcEngine: jest.fn(() => engine), RtcSurfaceView, RtcTextureView: RtcSurfaceView };
});

// Privacy Mode's screenshot block: records whether screenshots were blocked or allowed.
jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn(async () => {}),
  allowScreenCaptureAsync: jest.fn(async () => {}),
}));

// Device integrity checks (src/security/integrity.js): a clean phone unless a test says otherwise.
jest.mock('jail-monkey', () => {
  const no = () => jest.fn(() => false);
  return {
    __esModule: true,
    default: {
      isJailBroken: no(),
      hookDetected: no(),
      canMockLocation: no(),
      trustFall: no(),
      isOnExternalStorage: no(),
      AdbEnabled: no(),
      isDebuggedMode: jest.fn(async () => false),
      isDevelopmentSettingsMode: jest.fn(async () => false),
      jailBrokenMessage: jest.fn(() => ''),
    },
  };
});
jest.mock('expo-device', () => ({ isDevice: true }));
