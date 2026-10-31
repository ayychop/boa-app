import { act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import * as audio from 'expo-audio';

// Both audio engines, the real ones (not the app tests' stand-in), played
// roughly by a user who taps everything, with the system releasing the
// player under them at random: every native call can throw. Nothing may
// throw back at the caller, reject, or stop the next tap from working.
const radio = jest.requireActual('../src/audio/engine.native.js');
const zen = jest.requireActual('../src/audio/ambient.js');

jest.useFakeTimers();

const station = (n) => ({ kind: 'radio', id: `s${n}`, name: `Station ${n}`, streamUrl: `https://example.com/${n}.mp3`, logo: null });
const podcast = { kind: 'podcast', id: 'ep1', name: 'Episode 1', streamUrl: 'https://example.com/ep1.mp3', duration: 600 };

// A small seeded generator: the same "random" taps on every run.
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const flush = () => act(async () => {});
let now = 5_000_000;
jest.spyOn(Date, 'now').mockImplementation(() => now);
const tick = (ms) =>
  act(async () => {
    now += ms;
    jest.advanceTimersByTime(ms);
  });

/** Makes every native call on `player` throw while `broken.on`. */
function breakable(player, chance, random) {
  const broken = { on: false };
  const wrap = (name) => {
    const real = player[name];
    player[name] = jest.fn((...args) => {
      if (broken.on && random() < chance) throw new Error(`${name}: shared object was released`);
      return real(...args);
    });
  };
  ['play', 'pause', 'replace', 'setPlaybackRate', 'setActiveForLockScreen', 'updateLockScreenMetadata', 'remove'].forEach(wrap);
  const realSeek = player.seekTo;
  player.seekTo = jest.fn(async (...args) => {
    if (broken.on && random() < chance) throw new Error('seekTo: released');
    return realSeek(...args);
  });
  let volume = 1;
  Object.defineProperty(player, 'volume', {
    configurable: true,
    get: () => volume,
    set: (v) => {
      if (broken.on && random() < chance) throw new Error('volume: released');
      volume = v;
    },
  });
  return broken;
}

const settled = async (promises) => {
  const results = await act(async () => Promise.allSettled(promises));
  return results.filter((r) => r.status === 'rejected');
};

describe('the radio engine', () => {
  const random = rng(7);
  let handlers;
  beforeAll(async () => {
    AppState.currentState = 'active';
    handlers = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
      if (type === 'change') handlers.push(fn);
      return { remove: jest.fn() };
    });
    radio.play(station(1));
    await flush();
    await flush();
  });

  test('300 random taps, interruptions and lifecycle changes with a player that keeps failing: nothing throws, nothing rejects, and it still plays at the end', async () => {
    const player = audio.__players[0];
    const broken = breakable(player, 0.4, random);
    const rejections = [];
    const fades = [];
    const statuses = [];
    radio.subscribe((s) => statuses.push(s.status));
    // A listener that throws must not reach the engine either.
    radio.subscribe(() => {
      throw new Error('a screen mid-teardown');
    });

    const ops = [
      () => radio.play(station(1 + Math.floor(random() * 4))),
      () => radio.play(podcast),
      () => radio.pause(),
      () => radio.seek(random() * 500),
      () => radio.skip(15),
      () => radio.setRate(1 + random()),
      () => (fades.push(radio.fadeOut(300)), undefined),
      () => player.emit('playbackStatusUpdate', { playing: true, isBuffering: false, playbackState: 'ready', currentTime: random() * 100 }),
      () => player.emit('playbackStatusUpdate', { playing: false, isBuffering: true, playbackState: 'buffering' }),
      () => player.emit('playbackStatusUpdate', { playing: false, isBuffering: false, playbackState: 'ended', didJustFinish: true }),
      () => player.emit('playbackStatusUpdate', { error: 'ExoPlaybackException' }),
      () => player.emit('playbackStatusUpdate', null),
      () => player.emit('remoteNextTrack'),
      () => handlers.forEach((fn) => fn(['background', 'inactive', 'active'][Math.floor(random() * 3)])),
    ];

    for (let i = 0; i < 300; i++) {
      broken.on = random() < 0.7;
      const op = ops[Math.floor(random() * ops.length)];
      let out;
      expect(() => {
        out = op();
      }).not.toThrow();
      if (out && typeof out.then === 'function') rejections.push(...(await settled([out])));
      if (random() < 0.4) await tick(Math.floor(random() * 3000));
    }
    await tick(60000);
    await flush();
    // Every fade-out ended (a fade is a timer: it can't be left running).
    rejections.push(...(await settled(fades)));
    expect(rejections).toEqual([]);
    expect(statuses.length).toBeGreaterThan(50);

    // The player comes back to life: a plain tap works again.
    broken.on = false;
    radio.play(station(2));
    await flush();
    await flush();
    await act(async () => player.emit('playbackStatusUpdate', { playing: true, isBuffering: false, playbackState: 'ready', currentTime: 1 }));
    expect(statuses[statuses.length - 1]).toBe('playing');
    await radio.pause();
    expect(statuses[statuses.length - 1]).toBe('paused');
  });

  test('a sleep-timer fade-out whose player disappears mid-fade just ends (a throwing timer would be a crash)', async () => {
    const player = audio.__players[0];
    let alive = true;
    let volume = 1;
    Object.defineProperty(player, 'volume', {
      configurable: true,
      get: () => volume,
      set: (v) => {
        if (!alive) throw new Error('released');
        volume = v;
      },
    });
    radio.play(station(3));
    await flush();
    await flush();
    await act(async () => player.emit('playbackStatusUpdate', { playing: true, isBuffering: false, playbackState: 'ready', currentTime: 1 }));
    const fade = radio.fadeOut(5000);
    await tick(1000);
    alive = false;
    await tick(500);
    await expect(act(async () => fade)).resolves.toBeUndefined();
    await tick(10000);
  });
});

describe('the Zen soundscape engine', () => {
  const random = rng(11);

  test('300 random taps with a player that keeps failing: nothing throws, nothing rejects, and the next good tap plays', async () => {
    zen.stop();
    const before = audio.__players.length;
    await act(async () => zen.play('rain'));
    const player = audio.__players[audio.__players.length - 1];
    expect(audio.__players.length).toBe(before + 1);
    const broken = breakable(player, 0.4, random);
    const ids = ['rain', 'rain-calm', 'ocean', 'rain'];
    const rejections = [];
    const fades = [];
    zen.subscribe(() => {
      throw new Error('a screen mid-teardown');
    });

    const ops = [
      () => zen.play(ids[Math.floor(random() * ids.length)]),
      () => zen.pause(),
      () => zen.toggle('ocean'),
      () => zen.toggleCategory('rain'),
      () => zen.setVolume(random()),
      () => (fades.push(zen.fadeOut(300)), undefined),
      () => player.emit('playbackStatusUpdate', { error: 'boom' }),
      () => player.emit('playbackStatusUpdate', { playing: true }),
    ];
    for (let i = 0; i < 300; i++) {
      broken.on = random() < 0.7;
      const op = ops[Math.floor(random() * ops.length)];
      let out;
      expect(() => {
        out = op();
      }).not.toThrow();
      if (out && typeof out.then === 'function') rejections.push(...(await settled([out])));
      if (random() < 0.4) await tick(Math.floor(random() * 2000));
    }
    await tick(30000);
    rejections.push(...(await settled(fades)));
    expect(rejections).toEqual([]);

    broken.on = false;
    await act(async () => zen.play('rain'));
    expect(zen.getState().status).toBe('playing');
    expect(() => zen.stop()).not.toThrow();
    expect(zen.getState().status).toBe('idle');
  });

  test('resuming a paused soundscape whose player was released builds a fresh one instead of dying', async () => {
    zen.stop();
    await act(async () => zen.play('rain'));
    const first = audio.__players[audio.__players.length - 1];
    zen.pause();
    first.play.mockImplementation(() => {
      throw new Error('shared object was released');
    });
    const count = audio.__players.length;
    await act(async () => zen.play('rain'));
    await flush();
    expect(audio.__players.length).toBe(count + 1);
    expect(zen.getState().status).toBe('playing');
    expect(audio.__players[audio.__players.length - 1].play).toHaveBeenCalled();
  });
});
