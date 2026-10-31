import { act, screen, userEvent, within } from '@testing-library/react-native';
import { AppState } from 'react-native';
import * as fs from 'fs';
import * as path from 'path';
import * as video from 'expo-video';
import * as files from 'expo-file-system';
import * as screenEvents from '../modules/boa-screen';
import { SCREENSAVERS } from '../src/data/screensavers';
import { SCENES } from '../src/data/sleep';
import { advance as tick, bootIntoTabs, instrument, openTab, PORTRAIT, setWindow } from './helpers';

jest.useFakeTimers();

// The reported crash: pause the radio, press the power button, and the Zen
// screensaver opens. A video decoder started for a screen that is off (or an
// app that has left the front) is what took the app down, so the video now
// only exists while the screen is lit and the app is in front. These tests
// press the power button, background, wake and tap the radio far faster than
// a person could, and require: no errors, no decoder while the screen is
// off, never more than one video, and the picture back afterwards.

// Time in quarter-second steps: the room builds itself in stages (a settle
// timer, then the video's own, then a download), and each stage only starts
// once the render before it has committed, as it would on a phone.
async function advance(ms) {
  for (let t = 0; t < ms; t += 250) await tick(Math.min(250, ms - t));
}

let probe;
beforeEach(async () => {
  probe = instrument();
  AppState.currentState = 'active';
  await setWindow(PORTRAIT);
  jest.clearAllMocks();
  screenEvents.unlock.mockReset().mockImplementation(async () => true);
});
afterEach(() => {
  expect(probe.errors).toEqual([]);
  jest.restoreAllMocks();
});

const videos = () => screen.queryAllByTestId(/^zen-video-/);
const livePlayers = () => video.__players.length;

/** Boots, starts a station, opens `tab`, and leaves the radio paused. */
async function radioPausedOn(user, tab) {
  await bootIntoTabs(user);
  await user.press(screen.getAllByRole('button', { name: /^Play / })[0]);
  await advance(200);
  await openTab(user, tab);
  await user.press(screen.getByRole('button', { name: 'Pause' }));
  await advance(300);
}

describe('the reported crash: radio paused, power button, Zen screensaver', () => {
  test('no video decoder is ever started while the screen is off; the picture comes back once it is lit', async () => {
    const user = userEvent.setup();
    await radioPausedOn(user, 'Talent');
    const before = livePlayers();

    await probe.lock();
    await advance(4000);

    // The screensaver is up, as a still photograph: no video, no decoder.
    expect(screen.getByTestId('zen-screensaver')).toBeOnTheScreen();
    expect(screen.getByTestId('zen-scene-night')).toBeOnTheScreen();
    expect(videos()).toHaveLength(0);
    expect(livePlayers()).toBe(before);
    expect(screenEvents.setImmersive).toHaveBeenLastCalledWith(true);

    await probe.unlock();
    await advance(4000);
    expect(screen.getByTestId('zen-screensaver')).toBeOnTheScreen();
    expect(videos()).toHaveLength(1);
    expect(livePlayers()).toBe(before + 1);
    const p = video.__players[video.__players.length - 1];
    expect(p.playing).toBe(true);
  });

  test('the same with the app sent to the background (home button, app switcher) and brought back', async () => {
    const user = userEvent.setup();
    await radioPausedOn(user, 'Talent');
    await openTab(user, 'Zen');
    await advance(3000);
    expect(videos()).toHaveLength(1);

    await probe.setState('background');
    await advance(3000);
    expect(videos()).toHaveLength(0);

    const before = livePlayers();
    await probe.setState('background');
    await advance(500);
    expect(livePlayers()).toBe(before);

    await probe.setState('active');
    await advance(3000);
    expect(videos()).toHaveLength(1);
  });

  test('power button, wake, power button again, in quick succession, 30 times: nothing throws, nothing is left running', async () => {
    const user = userEvent.setup();
    await radioPausedOn(user, 'Talent');
    const before = livePlayers();

    for (let i = 0; i < 30; i++) {
      await probe.lock(i % 2 ? 'inactive' : 'background');
      await advance(60 + (i % 5) * 40);
      await probe.unlock();
      await advance(60 + (i % 3) * 50);
    }
    // Awake for far less than the settle time each time: no decoder was built.
    expect(livePlayers()).toBe(before);
    expect(videos().length).toBeLessThanOrEqual(1);

    // And once it is left alone, the room is back with exactly one video.
    await advance(5000);
    expect(screen.getByTestId('zen-screensaver')).toBeOnTheScreen();
    expect(videos()).toHaveLength(1);
    expect(livePlayers()).toBe(before + 1);
  });

  test('the screen-off and background events arriving in either order, and repeated, are harmless', async () => {
    const user = userEvent.setup();
    await radioPausedOn(user, 'Talent');
    const orders = [
      ['off', 'background'],
      ['background', 'off'],
      ['off', 'off'],
      ['background', 'background'],
    ];
    for (const order of orders) {
      for (const step of order) {
        if (step === 'off') await act(async () => screenEvents.__emit('off'));
        else await probe.setState('background');
        await advance(30);
      }
      expect(videos()).toHaveLength(0);
      await probe.unlock();
      await advance(100);
    }
    await advance(4000);
    expect(videos().length).toBeLessThanOrEqual(1);
  });

  test('tapping the radio\u2019s play and pause on the screensaver as fast as possible never builds a second decoder', async () => {
    const user = userEvent.setup();
    await bootIntoTabs(user);
    await user.press(screen.getAllByRole('button', { name: /^Play / })[0]);
    await advance(200);
    await openTab(user, 'Talent');
    await probe.lock();
    await advance(500);
    await probe.unlock();
    await advance(1000);
    expect(screen.getByTestId('zen-radio-info')).toBeOnTheScreen();
    const before = livePlayers();

    for (let i = 0; i < 25; i++) {
      const card = within(screen.getByTestId('zen-radio-info'));
      const pause = card.queryByRole('button', { name: 'Pause radio' });
      await user.press(pause ?? card.getByRole('button', { name: 'Play radio' }));
      await advance(60);
    }
    // Rapid toggling never lasted the settle time: no decoder was built.
    expect(livePlayers()).toBe(before);
    expect(videos().length).toBeLessThanOrEqual(1);

    // Left paused, the room settles into exactly one video.
    const card = within(screen.getByTestId('zen-radio-info'));
    if (card.queryByRole('button', { name: 'Pause radio' })) await user.press(card.getByRole('button', { name: 'Pause radio' }));
    await advance(4000);
    expect(videos()).toHaveLength(1);
    expect(livePlayers()).toBe(before + 1);
  });

  test('the screensaver hides the navigation bar, and gives it back when it ends', async () => {
    const user = userEvent.setup();
    await bootIntoTabs(user);
    await openTab(user, 'Talent');
    await probe.lock();
    await advance(800);
    await probe.unlock();
    await advance(800);
    expect(screenEvents.setImmersive).toHaveBeenLastCalledWith(true);

    await user.press(screen.getByRole('button', { name: 'Wake Zen controls' }));
    await advance(500);
    expect(screen.queryByTestId('zen-screensaver')).toBeNull();
    expect(screenEvents.setImmersive).toHaveBeenLastCalledWith(false);
  });
});

describe('a video that cannot play never takes the app (or the photograph) with it', () => {
  test('a decoder error drops the video, keeps the photograph and deletes the cached file', async () => {
    const user = userEvent.setup();
    await bootIntoTabs(user);
    await openTab(user, 'Zen');
    await advance(4000);
    expect(videos()).toHaveLength(1);
    const cached = () => [...files.__files.keys()].filter((k) => /\/scenes\/night-[0-9a-z]+-v2\.(webm|mov)$/.test(k));
    expect(cached()).toHaveLength(1);

    const player = video.__players[video.__players.length - 1];
    await act(async () => player.__emit('statusChange', { status: 'error', error: { message: 'decoder died' } }));
    await advance(500);

    expect(videos()).toHaveLength(0);
    expect(screen.getByTestId('zen-scene-night')).toBeOnTheScreen();
    expect(cached()).toHaveLength(0);
    // Still works: soundscapes, tabs.
    await user.press(screen.getByRole('button', { name: 'Play Rain' }));
    await advance(300);
    expect(screen.getByRole('button', { name: 'Pause Rain' })).toBeOnTheScreen();
  });

  test('a player that throws on every call (released by the system) is shrugged off', async () => {
    const real = video.useVideoPlayer;
    jest.spyOn(video, 'useVideoPlayer').mockImplementation((source, setup) => {
      const p = real(source, setup);
      const boom = () => {
        throw new Error('shared object was released');
      };
      p.play.mockImplementation(boom);
      p.pause.mockImplementation(boom);
      p.replace.mockImplementation(boom);
      p.addListener.mockImplementation(boom);
      return p;
    });
    const user = userEvent.setup();
    await bootIntoTabs(user);
    await openTab(user, 'Zen');
    await advance(4000);
    // Rapid tab changes and a lock while every call throws.
    for (let i = 0; i < 4; i++) {
      await openTab(user, 'Radio');
      await openTab(user, 'Zen');
    }
    await probe.lock();
    await advance(1000);
    await probe.unlock();
    await advance(3000);
    expect(screen.getByTestId('zen-screensaver')).toBeOnTheScreen();
  });

  test('a player whose setup throws still gets silent, mixed and looping settings where it can', async () => {
    const real = video.useVideoPlayer;
    jest.spyOn(video, 'useVideoPlayer').mockImplementation((source, setup) => {
      let first = true;
      return real(source, (p) => {
        // The first property write throws; the rest must still land.
        Object.defineProperty(p, 'audioMixingMode', {
          configurable: true,
          get: () => 'auto',
          set: () => {
            if (first) {
              first = false;
              throw new Error('unsupported');
            }
          },
        });
        setup(p);
      });
    });
    const user = userEvent.setup();
    await bootIntoTabs(user);
    await openTab(user, 'Zen');
    await advance(3000);
    const p = video.__players[video.__players.length - 1];
    expect(p.muted).toBe(true);
    expect(p.loop).toBe(true);
    expect(p.volume).toBe(0);
    expect(p.staysActiveInBackground).toBe(false);
    expect(p.keepScreenOnWhilePlaying).toBe(false);
  });

  test('the video plays silently, loops, never keeps the screen on or plays on in the background, and has no controls', async () => {
    const user = userEvent.setup();
    await bootIntoTabs(user);
    await openTab(user, 'Zen');
    await advance(4000);
    const p = video.__players[video.__players.length - 1];
    expect(p.loop).toBe(true);
    expect(p.muted).toBe(true);
    expect(p.audioMixingMode).toBe('mixWithOthers');
    expect(p.staysActiveInBackground).toBe(false);
    expect(p.showNowPlayingNotification).toBe(false);
    expect(p.keepScreenOnWhilePlaying).toBe(false);
    // The view itself: no native controls, no picture-in-picture.
    const src = fs.readFileSync(path.join(__dirname, '..', 'src/screens/ZenScreen.js'), 'utf8');
    expect(src).toMatch(/nativeControls=\{false\}/);
    expect(src).toMatch(/allowsPictureInPicture=\{false\}/);
    expect(src).toMatch(/surfaceType="textureView"/);
  });
});

describe('Zen screensaver look and choices', () => {
  test('the hint says BOA HUB, whichever tab the phone was locked on', async () => {
    const user = userEvent.setup();
    await bootIntoTabs(user);
    for (const tab of ['Radio', 'Talent']) {
      await openTab(user, tab);
      await probe.lock();
      await advance(500);
      await probe.unlock();
      await advance(500);
      expect(screen.getByText('Tap to go back to BOA HUB')).toBeOnTheScreen();
      expect(screen.queryByText(/go back to (Radio|Talent)/)).toBeNull();
      await user.press(screen.getByRole('button', { name: 'Wake Zen controls' }));
      await advance(500);
    }
  });

  test('no dark bar anywhere on the screensaver: no plate behind the sound, radio or hint', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src/screens/ZenScreen.js'), 'utf8');
    // The only veil is one even wash over the whole screen.
    expect(src).toMatch(/testID="zen-veil"/);
    expect(src).toMatch(/soundChipBare: \{ backgroundColor: 'transparent', borderWidth: 0 \}/);
    expect(src).toMatch(/radioCardBare: \{ backgroundColor: 'transparent', borderWidth: 0 \}/);
    expect(src).toMatch(/<RadioCard bare \/>/);
    // The system navigation bar's scrim goes while it is up.
    expect(src).toMatch(/setImmersive\(true\)/);
    expect(src).toMatch(/setImmersive\(false\)/);
  });

  test('the two original videos stay first (and the default); four new night skies follow, each a complete scene', () => {
    expect(SCREENSAVERS.slice(0, 2).map((s) => s.id)).toEqual(['night', 'rain']);
    const news = SCREENSAVERS.slice(2, 6);
    expect(news.map((s) => s.id)).toEqual(['milkyway', 'joshua', 'desert', 'startrails']);
    for (const s of news) {
      const scene = SCENES[s.scene];
      expect(scene).toBeDefined();
      expect(scene.video.uri).toMatch(/^https:\/\/upload\.wikimedia\.org\/.+\.webm$/);
      expect(scene.video.ios).toMatch(/^https:\/\/upload\.wikimedia\.org\/.+\.mov$/);
      expect(scene.uri).toMatch(/^https:\/\/upload\.wikimedia\.org\/.+\.jpg$/);
      expect(scene.video.license).toMatch(/CC|Public domain/);
      expect(s.generative).toBeUndefined();
    }
    // Four distinct videos, none of them the originals'.
    const uris = new Set(Object.values(SCENES).map((x) => x.video.uri));
    expect(uris.size).toBe(Object.keys(SCENES).length);
  });

  test('picking a new night sky plays that scene\u2019s video on the screensaver', async () => {
    const user = userEvent.setup();
    await bootIntoTabs(user);
    await openTab(user, 'Zen');
    await user.press(screen.getByTestId('zen-saver-pick-milkyway'));
    await advance(300);
    await openTab(user, 'Home');
    await probe.lock();
    await advance(500);
    await probe.unlock();
    await advance(4000);
    expect(screen.getByTestId('zen-screensaver')).toBeOnTheScreen();
    expect(screen.getByTestId('zen-scene-milkyway')).toBeOnTheScreen();
    expect(screen.getByTestId('zen-video-milkyway')).toBeOnTheScreen();
  });
});
