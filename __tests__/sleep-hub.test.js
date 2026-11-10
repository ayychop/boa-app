import { screen, userEvent, within } from '@testing-library/react-native';
import * as fs from 'expo-file-system';

const { File } = fs;
import * as audio from 'expo-audio';
import * as video from 'expo-video';
import { Platform } from 'react-native';
import * as engine from '../src/audio/engine';
import * as ambient from '../src/audio/ambient';
import { MEDIA_HEADERS, SCENES, SOUNDSCAPES, soundscapeById, ZEN_CATEGORIES } from '../src/data/sleep';
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
// Soundscape downloads (scene videos are cached too, in their own folder).
const audioDownloads = () => File.downloadFileAsync.mock.calls.filter((c) => c[1].uri.includes('/soundscapes/'));
// The Zen tab also downloads every soundscape in the background, so a
// test about one recording counts only that one.
const downloadsOf = (id) => audioDownloads().filter((c) => c[1].uri.endsWith(`/soundscapes/${id}.mp3`));
const videoExt = Platform.OS === 'ios' ? 'mov' : 'webm';

// Opens Zen from a tab's Zen button (Home, Radio) or the Zen tab itself.
async function openHub(user, from = 'Home') {
  await bootIntoTabs(user);
  if (from === 'Zen') await openTab(user, 'Zen');
  else {
    if (from !== 'Home') await openTab(user, from);
    const buttons = screen.getAllByRole('button', { name: 'Start Zen Mode' });
    await user.press(buttons[buttons.length - 1]);
  }
  await advance(1000);
  expect(screen.getByTestId('zen-screen')).toBeOnTheScreen();
}

test('the Zen button opens the Sleep & Meditation Hub with every kind of sound, the timer and the night scene', async () => {
  const user = userEvent.setup();
  await openHub(user);
  expect(screen.getByText('Sleep & Meditation')).toBeOnTheScreen();
  for (const k of ZEN_CATEGORIES) {
    expect(k.sounds).toHaveLength(6);
    expect(screen.getByRole('button', { name: `Play ${k.label}` })).toBeOnTheScreen();
  }
  for (const m of [15, 30, 45, 60, 90]) expect(screen.getByRole('button', { name: `Fade out in ${m} minutes` })).toBeOnTheScreen();
  // The background photograph is requested from Wikimedia with the app's
  // own User-Agent (Wikimedia refuses OkHttp's default).
  const scene = screen.getByTestId('zen-scene-night');
  expect(scene.props.source).toEqual({ uri: SCENES.night.uri, headers: MEDIA_HEADERS });
});

test.each(['Home', 'Radio', 'Zen'])('from %s: tapping Rain downloads the recording once, then loops it from the cache', async (tab) => {
  const user = userEvent.setup();
  await openHub(user, tab);
  await user.press(screen.getByRole('button', { name: 'Play Rain' }));
  await advance(200);

  const rain = soundscapeById('rain');
  expect(downloadsOf('rain')).toHaveLength(1);
  const [url, dest, options] = downloadsOf('rain')[0];
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
  expect(downloadsOf('rain')).toHaveLength(1);
});

test('switching soundscapes swaps the recording in the same looping player', async () => {
  const user = userEvent.setup();
  await openHub(user);
  // A kind plays its first sound: Frequencies is 432 Hz, Deep sleep is white noise.
  await user.press(screen.getByRole('button', { name: 'Play Frequencies' }));
  await advance(200);
  const player = lastPlayer();
  await user.press(screen.getByRole('button', { name: 'Play Deep sleep' }));
  await advance(200);
  // One player for every soundscape, all session.
  expect(audio.__players).toHaveLength(1);
  expect(player.replace).toHaveBeenLastCalledWith({ uri: 'file:///cache/soundscapes/white-noise.mp3' });
  expect(player.loop).toBe(true);
  // The six frequencies are in the app: never downloaded. Other recordings are, once.
  expect(downloadsOf('432hz')).toEqual([]);
  expect(downloadsOf('white-noise').map((c) => c[0])).toEqual([soundscapeById('white-noise').uri]);
});

test('if the download fails it streams the recording instead, with the same headers', async () => {
  const user = userEvent.setup();
  // Soundscape downloads fail (scene videos still cache).
  const download = File.downloadFileAsync.getMockImplementation();
  File.downloadFileAsync.mockImplementation((url, dest, opts) =>
    dest.uri.includes('/soundscapes/') ? Promise.reject(new Error('offline')) : download(url, dest, opts),
  );
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await openHub(user);
    await user.press(screen.getByRole('button', { name: 'Play Deep sleep' }));
    await advance(200);
    await user.press(screen.getByRole('button', { name: 'Choose Brown noise' }));
    await advance(200);
    expect(lastPlayer().source).toEqual({ uri: soundscapeById('brown-noise').uri, headers: MEDIA_HEADERS });
    expect(lastPlayer().loop).toBe(true);
  } finally {
    File.downloadFileAsync.mockImplementation(download);
  }
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
  // Sitting untouched never opens the screensaver (only a lock does), so
  // the controls are still there, showing Rain stopped.
  expect(screen.queryByTestId('zen-screensaver')).toBeNull();
  expect(screen.getByRole('button', { name: 'Play Rain' })).toBeOnTheScreen();
});

test('"Off" cancels the timer', async () => {
  const user = userEvent.setup();
  await openHub(user);
  await user.press(screen.getByRole('button', { name: 'Fade out in 30 minutes' }));
  expect(screen.getByText(/Fades out in 30:00/)).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'No fade out timer' }));
  expect(screen.queryByText(/Fades out in/)).not.toBeOnTheScreen();
});

test('the screensaver (after a lock) shows the room and what is playing, with just its own play and pause, and no Zen panel', async () => {
  const user = userEvent.setup();
  await openHub(user);
  await user.press(screen.getByRole('button', { name: 'Play Rain' }));
  await advance(200);
  await openTab(user, 'Radio');
  await probe.lock();
  await advance(500);
  await probe.unlock();
  await advance(500);
  expect(screen.getByTestId('zen-screensaver')).toBeOnTheScreen();
  const card = within(screen.getByTestId('zen-sound-info'));
  expect(card.getByText('On the window')).toBeOnTheScreen();
  expect(card.getByText('Rain · Playing')).toBeOnTheScreen();
  // The category buttons of the Zen page are not here; the card's own transport is.
  expect(screen.queryByRole('button', { name: /^(Play|Pause) Rain$/ })).toBeNull();
  expect(card.getByRole('button', { name: 'Pause On the window' })).toBeOnTheScreen();
  expect(screen.queryByTestId('zen-panel')).toBeNull();
  // The soundscape keeps playing through the screensaver.
  expect(lastPlayer().playing).toBe(true);
});

test('each scene loops its own video, muted, mixed with the app audio, from the cache', async () => {
  const user = userEvent.setup();
  await openHub(user, 'Zen');
  await advance(200);
  const night = video.__players[video.__players.length - 1];
  const nightUri = Platform.OS === 'ios' ? SCENES.night.video.ios : SCENES.night.video.uri;
  // Cached under the scene and a hash of its address, so a sharper video
  // replaces an old cached copy.
  const cachedAs = (scene) => new RegExp(`^file:///cache/scenes/${scene}-[0-9a-z]+-v2\\.${videoExt}$`);
  const nightDownload = File.downloadFileAsync.mock.calls.find(([u]) => u === nightUri);
  expect(nightDownload[1].uri).toMatch(cachedAs('night'));
  expect(nightDownload[2].headers).toBe(MEDIA_HEADERS);
  expect(night.source.uri).toMatch(cachedAs('night'));
  expect(night.loop).toBe(true);
  expect(night.muted).toBe(true);
  expect(night.audioMixingMode).toBe('mixWithOthers');
  expect(night.play).toHaveBeenCalled();
  // Rain brings the rain scene's video.
  await user.press(screen.getByRole('button', { name: 'Play Rain' }));
  // The new scene's video starts a moment after its photograph fades in.
  await advance(1500);
  const rain = video.__players[video.__players.length - 1];
  expect(rain).not.toBe(night);
  expect(rain.source.uri).toMatch(cachedAs('rain'));
  expect(rain.play).toHaveBeenCalled();
  // Off the Zen tab, the video is gone with the rest of the room; the
  // soundscape plays on.
  await openTab(user, 'Home');
  expect(screen.queryByTestId('zen-video-rain')).toBeNull();
  expect(lastPlayer().playing).toBe(true);
});

test('credits (in Profile) list every recording and photograph with its licence', async () => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await openTab(user, 'Profile');
  await user.press(screen.getByText('Credits'));
  await advance(300);
  const scenes = Object.values(SCENES);
  for (const s of [...SOUNDSCAPES, ...scenes, ...scenes.map((x) => x.video)]) {
    expect(screen.getByText(new RegExp(`${s.title.replace(/[()]/g, '.')}$`))).toBeOnTheScreen();
    expect(screen.getAllByText(`${s.author} · ${s.license}`).length).toBeGreaterThan(0);
  }
});

test('every recording and scene points at a real https file with a licence and a source page; generated sounds are bundled', () => {
  const scenes = Object.values(SCENES);
  for (const item of [...SOUNDSCAPES.filter((s) => !s.asset), ...scenes, ...scenes.map((x) => x.video)]) {
    expect(item.uri).toMatch(/^https:\/\/(upload\.wikimedia\.org|archive\.org)\//);
    expect(item.license).toMatch(/Public domain|CC0|CC BY/);
    expect(item.source).toMatch(/^https:\/\//);
    expect(item.author).toBeTruthy();
  }
  // BOA's own noise: in the app, no download, BOA's licence.
  const generated = SOUNDSCAPES.filter((s) => s.asset && s.category !== 'frequencies');
  expect(generated).toHaveLength(4);
  for (const s of generated) expect(s).toMatchObject({ author: 'BOA Networks', license: 'CC0 1.0', source: null });
  // The six frequencies: recordings bundled in the app, credited to their artist under CC BY.
  const frequencies = SOUNDSCAPES.filter((s) => s.category === 'frequencies');
  expect(frequencies.map((s) => s.id)).toEqual(['432hz', '396hz', '417hz', '528hz', '639hz', '741hz']);
  for (const s of frequencies) {
    expect(s.asset).toBeTruthy();
    expect(s).toMatchObject({ author: 'Megis', license: 'CC BY 3.0' });
    expect(s.source).toMatch(/^https:\/\/www\.jamendo\.com\//);
  }
  expect(new Set(SOUNDSCAPES.map((s) => s.id)).size).toBe(24);
  for (const s of scenes) expect(s.video.ios).toMatch(/^https:\/\/upload\.wikimedia\.org\/.+\.mov$/);
  expect(engine.fadeOut).toBeDefined();
});

test('the six frequency recordings are in the app, as frequency-1 to frequency-6, ready to loop', () => {
  const fs = require('fs');
  const path = require('path');
  const sleep = fs.readFileSync(path.join(__dirname, '../src/data/sleep.js'), 'utf8');
  for (let n = 1; n <= 6; n++) {
    const file = path.join(__dirname, `../assets/zen/frequency-${n}.mp3`);
    expect(fs.existsSync(file)).toBe(true);
    // Real audio, not a placeholder, and light enough to ship.
    const { size } = fs.statSync(file);
    expect(size).toBeGreaterThan(1_000_000);
    expect(size).toBeLessThan(8_000_000);
    expect(sleep).toContain(`require('../../assets/zen/frequency-${n}.mp3')`);
  }
  // MP3 (ID3 tag or an MPEG frame sync) at the start of each.
  for (let n = 1; n <= 6; n++) {
    const head = fs.readFileSync(path.join(__dirname, `../assets/zen/frequency-${n}.mp3`)).subarray(0, 3);
    expect(head.toString('latin1') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)).toBe(true);
  }
});

test('a bundled frequency is primed in a paused, looping player and plays at once, with no download', async () => {
  const ambient = require('../src/audio/ambient');
  const before = audio.__players.length;
  ambient.prime('432hz');
  const player = lastPlayer();
  expect(player.loop).toBe(true);
  expect(player.play).not.toHaveBeenCalled();
  expect(audio.__players.length).toBeLessThanOrEqual(before + 1);
  await ambient.play('432hz');
  await advance(200);
  expect(player.play).toHaveBeenCalled();
  expect(downloadsOf('432hz')).toEqual([]);
});
