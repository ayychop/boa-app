import * as fs from 'fs';
import * as path from 'path';

// BOA Radio in the car: the station catalogue the car browses, and the car's
// taps playing through the app's own audio engine (src/audio/car.js).

const mockNative = { setCatalogue: jest.fn(), setPlayback: jest.fn(), listener: null };
jest.mock('../modules/boa-auto', () => ({
  isAvailable: true,
  setCatalogue: (c) => mockNative.setCatalogue(c),
  setPlayback: (p) => mockNative.setPlayback(p),
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
    expect(sent.at(-1)).toEqual(
      expect.objectContaining({ status: 'paused', mediaId: AFRO[0].id, title: AFRO[0].name, artwork: AFRO[0].logo, canStep: true }),
    );
    const count = mockNative.setPlayback.mock.calls.length;
    await engine.pause();
    expect(mockNative.setPlayback.mock.calls.length).toBe(count);
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
