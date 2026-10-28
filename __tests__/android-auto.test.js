import * as fs from 'fs';
import * as path from 'path';

// BOA Radio in the car: the station catalogue the car browses, and the car's
// taps playing through the app's own audio engine (src/audio/car.js).

const mockNative = { setCatalogue: jest.fn(), setPlayback: jest.fn(), setTheme: jest.fn(), listener: null };
jest.mock('../modules/boa-auto', () => ({
  isAvailable: true,
  setCatalogue: (c) => mockNative.setCatalogue(c),
  setPlayback: (p) => mockNative.setPlayback(p),
  setTheme: (id) => mockNative.setTheme(id),
  addCommandListener: (fn) => {
    mockNative.listener = fn;
    return () => {};
  },
}));

const engine = require('../src/audio/engine');
const car = require('../src/audio/car');
const { STATIONS_BY_GENRE } = require('../src/data/radioStations');
const { GENRES } = require('../src/api/radio');

const AFRO = STATIONS_BY_GENRE.afrobeats;
let loaded = null;

beforeEach(() => {
  car.reset();
  loaded = null;
  mockNative.setCatalogue.mockClear();
  mockNative.setPlayback.mockClear();
  engine.play.mockClear();
  engine.pause.mockClear();
  engine.play.mockImplementation((item) => {
    loaded = item;
  });
  engine.getCurrent.mockImplementation(() => loaded);
});

describe('the car catalogue', () => {
  test('one folder per curated genre, every station with its name and logo', () => {
    const { folders } = car.catalogue();
    expect(folders.map((f) => f.title)).toEqual(GENRES.filter((g) => STATIONS_BY_GENRE[g.tag]?.length).map((g) => g.label));
    const afro = folders.find((f) => f.id === 'genre:afrobeats');
    expect(afro.stations).toHaveLength(AFRO.length);
    expect(afro.stations[0]).toEqual(expect.objectContaining({ id: AFRO[0].id, name: AFRO[0].name, logo: AFRO[0].logo }));
  });

  test('is sent to the car as JS starts, and again when the car asks', () => {
    car.start();
    expect(mockNative.setCatalogue).toHaveBeenCalledTimes(1);
    mockNative.listener({ action: 'catalogue' });
    expect(mockNative.setCatalogue).toHaveBeenCalledTimes(2);
  });
});

describe('car controls', () => {
  test('tapping a station before the app is open plays it through the engine', () => {
    car.start();
    mockNative.listener({ action: 'play', mediaId: AFRO[1].id });
    expect(engine.play).toHaveBeenCalledWith(AFRO[1]);
    // The app picks it up when opened, with its genre as the queue.
    expect(car.takeBoot()).toEqual({ item: AFRO[1], list: AFRO });
  });

  test('next and previous step through the genre, wrapping round', () => {
    car.handle({ action: 'play', mediaId: AFRO[0].id });
    car.handle({ action: 'previous' });
    expect(loaded).toBe(AFRO[AFRO.length - 1]);
    car.handle({ action: 'next' });
    car.handle({ action: 'next' });
    expect(loaded).toBe(AFRO[1]);
  });

  test('pause pauses, and play carries on with what is loaded', () => {
    car.handle({ action: 'play', mediaId: AFRO[2].id });
    car.handle({ action: 'pause' });
    expect(engine.pause).toHaveBeenCalled();
    engine.play.mockClear();
    car.handle({ action: 'resume' });
    expect(engine.play).toHaveBeenCalledWith(AFRO[2]);
  });

  test('play on a fresh start resumes the last station the car played', () => {
    car.handle({ action: 'resume', mediaId: AFRO[3].id });
    expect(engine.play).toHaveBeenCalledWith(AFRO[3]);
  });

  test('once the app is open, the car plays through the player so the app follows', () => {
    const player = { play: jest.fn(), next: jest.fn(), previous: jest.fn(), canStep: () => true };
    const detach = car.attachPlayer(player);
    car.handle({ action: 'play', mediaId: AFRO[1].id });
    expect(player.play).toHaveBeenCalledWith(AFRO[1], AFRO);
    expect(engine.play).not.toHaveBeenCalled();
    car.handle({ action: 'next' });
    car.handle({ action: 'previous' });
    expect(player.next).toHaveBeenCalledTimes(1);
    expect(player.previous).toHaveBeenCalledTimes(1);
    detach();
  });

  test('an unknown station does nothing', () => {
    car.handle({ action: 'play', mediaId: 'not-a-station' });
    expect(engine.play).not.toHaveBeenCalled();
  });
});

describe('the car now playing screen', () => {
  test("mirrors the engine's state, without repeating itself", async () => {
    car.start();
    car.handle({ action: 'play', mediaId: AFRO[0].id });
    await engine.pause();
    const sent = mockNative.setPlayback.mock.calls.map((c) => c[0]);
    expect(sent.at(-1)).toEqual(expect.objectContaining({ status: 'paused', mediaId: AFRO[0].id, title: AFRO[0].name, artwork: AFRO[0].logo, canStep: true }));
    const count = mockNative.setPlayback.mock.calls.length;
    await engine.pause();
    expect(mockNative.setPlayback.mock.calls.length).toBe(count);
  });

  test('no heart without favourites attached (no Premium, or the app not open)', async () => {
    car.start();
    car.handle({ action: 'play', mediaId: AFRO[0].id });
    await engine.pause();
    expect(mockNative.setPlayback.mock.calls.at(-1)[0].favourite).toBeNull();
  });

  test("the heart saves and unsaves the station that's on, and shows its state at once", async () => {
    car.start();
    car.handle({ action: 'play', mediaId: AFRO[0].id });
    await engine.pause();
    const saved = new Set();
    const favs = { isSaved: (id) => saved.has(id), toggle: jest.fn((s) => (saved.has(s.id) ? saved.delete(s.id) : saved.add(s.id))) };
    const detach = car.attachFavourites(favs);
    expect(mockNative.setPlayback.mock.calls.at(-1)[0].favourite).toBe(false);
    car.handle({ action: 'favourite', mediaId: AFRO[0].id });
    expect(favs.toggle).toHaveBeenCalledWith(AFRO[0]);
    expect(mockNative.setPlayback.mock.calls.at(-1)[0].favourite).toBe(true);
    car.handle({ action: 'favourite', mediaId: AFRO[0].id });
    expect(mockNative.setPlayback.mock.calls.at(-1)[0].favourite).toBe(false);
    // A stale tap for a station that's no longer on does nothing.
    car.handle({ action: 'favourite', mediaId: AFRO[1].id });
    expect(favs.toggle).toHaveBeenCalledTimes(2);
    detach();
    expect(mockNative.setPlayback.mock.calls.at(-1)[0].favourite).toBeNull();
  });

  test('the fire hypes the station once a day, lights at once, and is hidden when not signed in', async () => {
    car.start();
    car.handle({ action: 'play', mediaId: AFRO[0].id });
    await engine.pause();
    expect(mockNative.setPlayback.mock.calls.at(-1)[0].hyped).toBeNull();
    const fired = new Set();
    const hype = { hyped: (id) => fired.has(id), fire: jest.fn((s) => fired.add(s.id)) };
    const detach = car.attachHype(hype);
    expect(mockNative.setPlayback.mock.calls.at(-1)[0].hyped).toBe(false);
    car.handle({ action: 'fire', mediaId: AFRO[0].id });
    expect(hype.fire).toHaveBeenCalledWith(AFRO[0]);
    expect(mockNative.setPlayback.mock.calls.at(-1)[0].hyped).toBe(true);
    // Already fired today: a second tap does nothing.
    car.handle({ action: 'fire', mediaId: AFRO[0].id });
    // A stale tap for a station that's no longer on does nothing.
    car.handle({ action: 'fire', mediaId: AFRO[1].id });
    expect(hype.fire).toHaveBeenCalledTimes(1);
    // Fire and heart are separate: the fire never touches favourites.
    expect(mockNative.setPlayback.mock.calls.at(-1)[0].favourite).toBeNull();
    detach();
    expect(mockNative.setPlayback.mock.calls.at(-1)[0].hyped).toBeNull();
  });
});

describe('the Android build', () => {
  const root = path.join(__dirname, '..', 'modules', 'boa-auto', 'android', 'src', 'main');
  test('declares the media browser service and the media app category', () => {
    const manifest = fs.readFileSync(path.join(root, 'AndroidManifest.xml'), 'utf8');
    expect(manifest).toContain('android.media.browse.MediaBrowserService');
    expect(manifest).toContain('com.google.android.gms.car.application');
    const desc = fs.readFileSync(path.join(root, 'res', 'xml', 'automotive_app_desc.xml'), 'utf8');
    expect(desc).toMatch(/<uses name="media"\s*\/>/);
  });
});

describe('the car screen', () => {
  const kt = path.join(__dirname, '..', 'modules', 'boa-auto', 'android', 'src', 'main');
  const service = fs.readFileSync(path.join(kt, 'java', 'expo', 'modules', 'boaauto', 'BoaAutoService.kt'), 'utf8');
  test('has a Spotlight tab and a Genres tab, all art tiles, every station with art', () => {
    expect(service).toContain('tab(SPOTLIGHT, "Spotlight"), tab(GENRES, "Genres")');
    expect(service).toMatch(/putInt\(CONTENT_STYLE_BROWSABLE_HINT, CONTENT_STYLE_GRID\)/);
    expect(service).toMatch(/putInt\(CONTENT_STYLE_PLAYABLE_HINT, CONTENT_STYLE_GRID\)/);
    expect(service).toContain('.setIconUri(BoaAutoArtProvider.stationUri(this, station.id))');
  });

  test('lets the heart and the fire sit beside play, lit gold', () => {
    expect(service).toContain('putBoolean(SLOT_RESERVATION_SKIP_TO_PREV, false)');
    for (const icon of ['boa_auto_heart_filled', 'boa_auto_fire_filled']) {
      expect(fs.readFileSync(path.join(kt, 'res', 'drawable', `${icon}.xml`), 'utf8')).toContain('#FFE2A84B');
    }
  });
});

describe('the car screen', () => {
  const kt = path.join(__dirname, '..', 'modules', 'boa-auto', 'android', 'src', 'main');
  const service = fs.readFileSync(path.join(kt, 'java', 'expo', 'modules', 'boaauto', 'BoaAutoService.kt'), 'utf8');
  test('has a Spotlight tab and a Genres tab, all art tiles, every station with art', () => {
    expect(service).toContain('tab(SPOTLIGHT, "Spotlight"), tab(GENRES, "Genres")');
    expect(service).toMatch(/putInt\(CONTENT_STYLE_BROWSABLE_HINT, CONTENT_STYLE_GRID\)/);
    expect(service).toMatch(/putInt\(CONTENT_STYLE_PLAYABLE_HINT, CONTENT_STYLE_GRID\)/);
    expect(service).toContain('.setIconUri(BoaAutoArtProvider.stationUri(this, station.id))');
  });

  test('lets the heart and the fire sit beside play, lit gold', () => {
    expect(service).toContain('putBoolean(SLOT_RESERVATION_SKIP_TO_PREV, false)');
    for (const icon of ['boa_auto_heart_filled', 'boa_auto_fire_filled']) {
      expect(fs.readFileSync(path.join(kt, 'res', 'drawable', `${icon}.xml`), 'utf8')).toContain('#FFE2A84B');
    }
  });
});

describe('the steering wheel', () => {
  test("skip works even with no queue: it steps through the station's genre", () => {
    const player = { play: jest.fn(), next: jest.fn(), previous: jest.fn(), canStep: () => false };
    car.attachPlayer(player);
    loaded = { ...AFRO[0], kind: 'radio' };
    car.handle({ action: 'next' });
    expect(player.next).not.toHaveBeenCalled();
    expect(player.play).toHaveBeenCalledWith(AFRO[1], AFRO);
    car.handle({ action: 'previous' });
    expect(player.play).toHaveBeenLastCalledWith(AFRO[AFRO.length - 1], AFRO);
  });

  test('with a queue, skip goes through the app so it follows', () => {
    const player = { play: jest.fn(), next: jest.fn(), previous: jest.fn(), canStep: () => true };
    car.attachPlayer(player);
    car.handle({ action: 'next' });
    expect(player.next).toHaveBeenCalled();
  });

  test('a curated station always offers next and previous to the car, even with no queue', async () => {
    car.start();
    car.attachPlayer({ play: jest.fn(), next: jest.fn(), previous: jest.fn(), canStep: () => false });
    loaded = { ...AFRO[0], kind: 'radio' };
    await engine.pause();
    expect(mockNative.setPlayback.mock.calls.at(-1)[0]).toEqual(expect.objectContaining({ mediaId: AFRO[0].id, canStep: true }));
  });

  test('the car session takes the hardware buttons itself, and always lists skip for a station', () => {
    const kt = fs.readFileSync(path.join(__dirname, '../modules/boa-auto/android/src/main/java/expo/modules/boaauto/BoaAutoService.kt'), 'utf8');
    expect(kt).toMatch(/override fun onMediaButtonEvent/);
    for (const key of ['KEYCODE_MEDIA_PLAY_PAUSE', 'KEYCODE_HEADSETHOOK', 'KEYCODE_MEDIA_NEXT', 'KEYCODE_MEDIA_PREVIOUS', 'KEYCODE_MEDIA_PLAY', 'KEYCODE_MEDIA_PAUSE']) expect(kt).toContain(key);
    // One press is one action: only key-down, never auto-repeat.
    expect(kt).toMatch(/if \(key\.action != KeyEvent\.ACTION_DOWN\) return true/);
    expect(kt).toMatch(/if \(p\.canStep \|\| p\.mediaId != null\) actions = actions or PlaybackStateCompat\.ACTION_SKIP_TO_NEXT/);
    expect(kt).toMatch(/setPlaybackToLocal\(AudioManager\.STREAM_MUSIC\)/);
  });

  test("R8 keeps Android Auto's media classes, so the car can always bind BOA Radio", () => {
    const rules = require('../app.json').expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-build-properties')[1].android.extraProguardRules;
    expect(rules).toMatch(/-keep class expo\.modules\.boaauto\.\*\* \{ \*; \}/);
    expect(rules).toMatch(/-keep class android\.support\.v4\.media\.\*\* \{ \*; \}/);
    expect(rules).toMatch(/-keep class androidx\.media\.\*\* \{ \*; \}/);
  });
});

describe('car themes', () => {
  const { CAR_THEMES, DEFAULT_CAR_THEME, loadCarTheme, setCarTheme } = require('../src/audio/carTheme');
  const native = (f) => fs.readFileSync(path.join(__dirname, '../modules/boa-auto/android/src/main/java/expo/modules/boaauto', f), 'utf8');

  test("five themes, each drawn natively under the same id; Noir Gold until one's chosen", async () => {
    expect(CAR_THEMES.map((t) => t.id)).toEqual(['noir', 'aurora', 'chrome', 'sunset', 'carbon']);
    expect(DEFAULT_CAR_THEME).toBe('noir');
    const art = native('BoaAutoArt.kt');
    for (const t of CAR_THEMES) {
      expect(art).toContain(`CarTheme("${t.id}", c("${t.colors[1]}"), c("${t.colors[0]}"), c("${t.glow}")`);
    }
    expect(await loadCarTheme()).toBe('noir');
  });

  test('choosing one saves it and the car redraws: every tile and the now playing art change address', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await setCarTheme('sunset');
    expect(mockNative.setTheme).toHaveBeenLastCalledWith('sunset');
    expect(await AsyncStorage.getItem('boa.car.theme')).toBe('sunset');
    expect(await setCarTheme('nope')).toBe('noir');
    const provider = native('BoaAutoArtProvider.kt');
    expect(provider).toMatch(/private fun version\(ctx: Context\) = "\$ART_VERSION\.\$\{BoaAutoStore\.theme\(ctx\)\.id\}"/);
    expect(provider).toMatch(/composed\(ctx, "station\|\$\{theme\.id\}\|/);
    expect(native('BoaAutoModule.kt')).toMatch(/Function\("setTheme"\)/);
    expect(native('BoaAutoService.kt')).toMatch(/fun onTheme\(\)/);
  });

  test('the car is told the saved theme as JS starts, before it draws a tile', async () => {
    await setCarTheme('carbon');
    mockNative.setTheme.mockClear();
    car.reset();
    car.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(mockNative.setTheme).toHaveBeenCalledWith('carbon');
    await setCarTheme('noir');
  });
});
