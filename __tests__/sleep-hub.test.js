import { screen, userEvent } from '@testing-library/react-native';
import * as fs from 'expo-file-system';

const { File } = fs;
import * as audio from 'expo-audio';
import * as engine from '../src/audio/engine';
import * as ambient from '../src/audio/ambient';
import { MEDIA_HEADERS, SCENES, SOUNDSCAPES, soundscapeById } from '../src/data/sleep';
import { advance, bootIntoTabs, instrument, openTab, PORTRAIT, setWindow } from './helpers';

jest.useFakeTimers();

let probe;
beforeEach(async () => {
  probe = instrument();
  await setWindow(PORTRAIT);
  ambient.stop();
  // A fresh, empty cache and clean call counts. The soundscape engine keeps
  // its one player for the whole session, so the player itself stays.
  fs.__files.clear();
  File.downloadFileAsync.mockClear();
  audio.createAudioPlayer.mockClear();
  audio.__players.forEach((p) => Object.values(p).forEach((v) => v?.mockClear?.()));
});

afterEach(() => {
  expect(probe.errors).toEqual([]);
  jest.restoreAllMocks();
});

const lastPlayer = () => audio.__players[audio.__players.length - 1];

async function openHub(user, tab = 'Home') {
  await bootIntoTabs(user);
  if (tab !== 'Home') await openTab(user, tab);
  const buttons = screen.getAllByRole('button', { name: 'Start Zen Mode' });
  await user.press(buttons[buttons.length - 1]);
  await advance(1000);
}

test('the Zen button opens the Sleep & Meditation Hub with every soundscape, the timer and the night scene', async () => {
  const user = userEvent.setup();
  await openHub(user);
  expect(screen.getByText('Sleep & Meditation')).toBeOnTheScreen();
  for (const s of SOUNDSCAPES) expect(screen.getByRole('button', { name: `Play ${s.label}` })).toBeOnTheScreen();
  for (const m of [15, 30, 45, 60, 90]) expect(screen.getByRole('button', { name: `Fade out in ${m} minutes` })).toBeOnTheScreen();
  // The background photograph is requested from Wikimedia with the app's
  // own User-Agent (Wikimedia refuses OkHttp's default).
  const scene = screen.getByTestId('zen-scene-night');
  expect(scene.props.source).toEqual({ uri: SCENES.night.uri, headers: MEDIA_HEADERS });
});

test.each(['Home', 'Radio'])('from %s: tapping Rain downloads the recording once, then loops it from the cache', async (tab) => {
  const user = userEvent.setup();
  await openHub(user, tab);
  await user.press(screen.getByRole('button', { name: 'Play Rain' }));
  await advance(200);

  const rain = soundscapeById('rain');
  expect(File.downloadFileAsync).toHaveBeenCalledTimes(1);
  const [url, dest, options] = File.downloadFileAsync.mock.calls[0];
  expect(url).toBe(rain.uri);
  expect(dest.uri).toBe('file:///cache/soundscapes/rain.mp3');
  expect(options.headers).toEqual(MEDIA_HEADERS);

  const player = lastPlayer();
  expect(player.source).toEqual({ uri: 'file:///cache/soundscapes/rain.mp3' });
  expect(player.loop).toBe(true);
  expect(player.play).toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Pause Rain' })).toBeOnTheScreen();
  // The room changes to the rain scene.
  expect(screen.getByTestId('zen-scene-rain').props.source.uri).toBe(SCENES.rain.uri);

  // Tapping it again pauses; once more resumes from the cache, no new download.
  await user.press(screen.getByRole('button', { name: 'Pause Rain' }));
  expect(player.pause).toHaveBeenCalled();
  await user.press(screen.getByRole('button', { name: 'Play Rain' }));
  await advance(200);
  expect(File.downloadFileAsync).toHaveBeenCalledTimes(1);
});

test('switching soundscapes swaps the recording in the same looping player', async () => {
  const user = userEvent.setup();
  await openHub(user);
  await user.press(screen.getByRole('button', { name: 'Play 432 Hz' }));
  await advance(200);
  const player = lastPlayer();
  await user.press(screen.getByRole('button', { name: 'Play Deep sleep' }));
  await advance(200);
  // One player for every soundscape, all session.
  expect(audio.__players).toHaveLength(1);
  expect(player.replace).toHaveBeenLastCalledWith({ uri: 'file:///cache/soundscapes/white-noise.mp3' });
  expect(player.loop).toBe(true);
  expect(File.downloadFileAsync.mock.calls.map((c) => c[0])).toEqual([soundscapeById('432hz').uri, soundscapeById('white-noise').uri]);
});

test('if the download fails it streams the recording instead, with the same headers', async () => {
  const user = userEvent.setup();
  File.downloadFileAsync.mockRejectedValueOnce(new Error('offline'));
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await openHub(user);
  await user.press(screen.getByRole('button', { name: 'Play Brown noise' }));
  await advance(200);
  expect(lastPlayer().source).toEqual({ uri: soundscapeById('brown-noise').uri, headers: MEDIA_HEADERS });
  expect(lastPlayer().loop).toBe(true);
});

test('the fade-out timer fades the soundscape and the radio out together, then stops them', async () => {
  const user = userEvent.setup();
  await openHub(user);
  await user.press(screen.getByRole('button', { name: 'Play Rain' }));
  await advance(200);
  const player = lastPlayer();
  await user.press(screen.getByRole('button', { name: 'Fade out in 15 minutes' }));
  expect(screen.getByText(/Fades out in 15:00/)).toBeOnTheScreen();

  await advance(15 * 60 * 1000);
  // Half way through the 30 second fade: quieter, still going.
  await advance(15000);
  expect(player.volume).toBeGreaterThan(0);
  expect(player.volume).toBeLessThan(0.5);
  expect(player.pause).not.toHaveBeenCalled();
  await advance(16000);
  expect(player.pause).toHaveBeenCalled();
  // Volume is put back for next time.
  expect(player.volume).toBe(1);
  expect(screen.getByRole('button', { name: 'Play Rain' })).toBeOnTheScreen();
});

test('"Off" cancels the timer', async () => {
  const user = userEvent.setup();
  await openHub(user);
  await user.press(screen.getByRole('button', { name: 'Fade out in 30 minutes' }));
  expect(screen.getByText(/Fades out in 30:00/)).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'No fade-out timer' }));
  expect(screen.queryByText(/Fades out in/)).not.toBeOnTheScreen();
});

test('passive Zen (after a lock) shows the room and what is playing, with no controls', async () => {
  const user = userEvent.setup();
  await openHub(user);
  await user.press(screen.getByRole('button', { name: 'Play Rain' }));
  await advance(200);
  await user.press(screen.getByRole('button', { name: 'Close Zen Mode' }));
  await advance(400);
  await probe.setState('background');
  await advance(500);
  await probe.setState('active');
  await advance(500);
  expect(screen.getByTestId('zen-passive')).toBeOnTheScreen();
  expect(screen.getByText('Rain · On the window')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: /^(Play|Pause) Rain$/ })).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Close Zen Mode' })).not.toBeOnTheScreen();
  // The soundscape keeps playing through the screensaver.
  expect(lastPlayer().playing).toBe(true);
});

test('credits list every recording and photograph with its licence', async () => {
  const user = userEvent.setup();
  await openHub(user);
  await user.press(screen.getByRole('button', { name: 'Sound and photo credits' }));
  await advance(300);
  for (const s of [...SOUNDSCAPES, ...Object.values(SCENES)]) {
    expect(screen.getByText(new RegExp(`${s.title.replace(/[()]/g, '.')}$`))).toBeOnTheScreen();
    expect(screen.getAllByText(`${s.author} · ${s.license}`).length).toBeGreaterThan(0);
  }
});

test('every soundscape and scene points at a real https file with a licence and a source page', () => {
  for (const item of [...SOUNDSCAPES, ...Object.values(SCENES)]) {
    expect(item.uri).toMatch(/^https:\/\/(upload\.wikimedia\.org|archive\.org)\//);
    expect(item.license).toMatch(/Public domain|CC0|CC BY/);
    expect(item.source).toMatch(/^https:\/\//);
    expect(item.author).toBeTruthy();
  }
  expect(engine.fadeOut).toBeDefined();
});
