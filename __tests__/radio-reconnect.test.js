import fs from 'fs';
import path from 'path';
import { act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import * as audio from 'expo-audio';

// The real native engine, not the stand-in the app tests use.
const engine = jest.requireActual('../src/audio/engine.native.js');

jest.useFakeTimers();

const station = { kind: 'radio', id: 'joy', name: 'Joy FM', streamUrl: 'https://example.com/joy.mp3', logo: null };
const flush = () => act(async () => {});
const player = () => audio.__players[0];
let status = null;
const playing = (t) => act(async () => player().emit('playbackStatusUpdate', { playing: true, isBuffering: false, playbackState: 'ready', currentTime: t }));
// The engine reads Date.now() for its clock watchdog; move it with the fake timers.
let now = 1_000_000;
jest.spyOn(Date, 'now').mockImplementation(() => now);
const tick = (ms) =>
  act(async () => {
    now += ms;
    jest.advanceTimersByTime(ms);
  });

beforeAll(async () => {
  AppState.currentState = 'active';
  engine.subscribe((s) => (status = s));
  engine.play(station);
  await flush();
  await flush();
  await playing(1);
});

describe('radio plays on like a music player: a drop reconnects by itself', () => {
  test('a station that has played and then drops (the server closing the stream) comes straight back, however many times', async () => {
    expect(status.status).toBe('playing');
    for (let i = 0; i < 4; i++) {
      const before = player().replace.mock.calls.length;
      await act(async () => player().emit('playbackStatusUpdate', { playing: false, isBuffering: false, playbackState: 'ended', didJustFinish: true, currentTime: 5 }));
      expect(status.status).toBe('loading');
      // Never longer than 8s, however long it has been down.
      await tick(8000);
      await flush();
      expect(player().replace.mock.calls.length).toBe(before + 1);
      await playing(1);
      expect(status.status).toBe('playing');
    }
  });

  test('a drop while it was already buffering (loading) still reconnects instead of sitting off', async () => {
    await act(async () => player().emit('playbackStatusUpdate', { playing: false, isBuffering: true, playbackState: 'buffering' }));
    expect(status.status).toBe('loading');
    const before = player().replace.mock.calls.length;
    await act(async () => player().emit('playbackStatusUpdate', { playing: false, isBuffering: false, playbackState: 'ended', didJustFinish: true }));
    await tick(8000);
    await flush();
    expect(player().replace.mock.calls.length).toBe(before + 1);
    await playing(1);
    expect(status.status).toBe('playing');
  });

  test('"playing" with a stuck clock (a half-dead connection, no error) is reconnected after 8s', async () => {
    await playing(10);
    await playing(11);
    await playing(12);
    const before = player().replace.mock.calls.length;
    // The clock stands still while the player keeps saying playing.
    for (let i = 0; i < 9; i++) {
      await tick(1000);
      await playing(12);
    }
    expect(status.status).toBe('loading');
    await tick(8000);
    await flush();
    expect(player().replace.mock.calls.length).toBe(before + 1);
    await playing(1);
    expect(status.status).toBe('playing');
  });

  test('a stream whose clock never moves (some report 0) is left alone', async () => {
    await act(async () => player().emit('playbackStatusUpdate', { playing: false, isBuffering: false, playbackState: 'ended', didJustFinish: true }));
    await tick(8000);
    await flush();
    await playing(0);
    const before = player().replace.mock.calls.length;
    for (let i = 0; i < 20; i++) {
      await tick(1000);
      await playing(0);
    }
    expect(status.status).toBe('playing');
    expect(player().replace.mock.calls.length).toBe(before);
  });

  test('pausing is the listener\'s choice and stays paused', async () => {
    await engine.pause();
    await tick(60000);
    expect(status.status).toBe('paused');
  });

  test('the backoff caps at 8 seconds', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/audio/engine.native.js'), 'utf8');
    expect(src).toMatch(/RECONNECT_DELAYS_MS = \[400, 800, 1500, 3000, 5000, 8000\]/);
  });
});
