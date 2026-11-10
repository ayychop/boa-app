// The final polish: the swipe-away play bar, the Home profile shortcut, Edge
// Lighting on by default, and the quick-switching tabs.

import fs from 'fs';
import path from 'path';
import { act, screen, userEvent, within } from '@testing-library/react-native';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { advance, bootIntoTabs, instrument, openTab, PORTRAIT, setWindow } from './helpers';

jest.useFakeTimers();

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('the play bar swipes away without stopping the audio', () => {
  const mini = require('../src/audio/miniDismiss');
  const ambient = require('../src/audio/ambient');

  let probe;
  beforeEach(async () => {
    probe = instrument();
    await setWindow(PORTRAIT);
    ambient.stop();
    mini.resetMini();
  });
  afterEach(() => {
    expect(probe.errors).toEqual([]);
    jest.restoreAllMocks();
  });

  test('the store: dismissed, restored, and restored by something new playing or nothing playing', () => {
    const heard = jest.fn();
    const off = mini.onMiniDismissed?.(heard);
    expect(mini.isMiniDismissed()).toBe(false);
    mini.syncMiniKey('radio:a');
    mini.dismissMini();
    expect(mini.isMiniDismissed()).toBe(true);
    // The same thing playing: it stays hidden.
    mini.syncMiniKey('radio:a');
    expect(mini.isMiniDismissed()).toBe(true);
    // Something else starts: the bar is back.
    mini.syncMiniKey('radio:b');
    expect(mini.isMiniDismissed()).toBe(false);
    mini.dismissMini();
    // Nothing playing any more: back too, ready for the next song.
    mini.syncMiniKey(null);
    expect(mini.isMiniDismissed()).toBe(false);
    mini.dismissMini();
    mini.restoreMini();
    expect(mini.isMiniDismissed()).toBe(false);
    off?.();
  });

  test('swiped away: the pill goes, a music icon appears, the sound plays on; tap the icon and the pill returns', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await bootIntoTabs(user);
    await openTab(user, 'Zen');
    await user.press(screen.getByRole('button', { name: 'Play Rain' }));
    await advance(300);
    await openTab(user, 'Talent');
    expect(screen.getByTestId('mini-player-zen')).toBeOnTheScreen();
    expect(screen.getByTestId('mini-player-swipe')).toBeOnTheScreen();
    expect(screen.queryByTestId('mini-player-fab')).toBeNull();

    // The swipe ends in this.
    await act(async () => mini.dismissMini());
    await advance(300);
    expect(screen.queryByTestId('mini-player-zen')).toBeNull();
    expect(screen.getByTestId('mini-player-fab')).toBeOnTheScreen();
    expect(screen.getByLabelText('Show the player')).toBeOnTheScreen();
    // Hiding the bar never touches the audio.
    expect(ambient.getState().status).toBe('playing');

    await user.press(screen.getByTestId('mini-player-fab'));
    await advance(400);
    expect(screen.getByTestId('mini-player-zen')).toBeOnTheScreen();
    expect(screen.queryByTestId('mini-player-fab')).toBeNull();
    expect(ambient.getState().status).toBe('playing');

    // Hidden again, then a different sound: the bar comes back by itself.
    await act(async () => mini.dismissMini());
    await advance(300);
    await openTab(user, 'Zen');
    await user.press(screen.getByRole('button', { name: 'Play Frequencies' }));
    await advance(300);
    await openTab(user, 'Talent');
    expect(screen.getByTestId('mini-player-zen')).toBeOnTheScreen();
    expect(screen.queryByTestId('mini-player-fab')).toBeNull();
  });

  test('the hidden flag never uses useSyncExternalStore (a frozen tab would retry its Suspense boundary forever)', () => {
    const src = read('src/audio/miniDismiss.js').replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
    expect(src).not.toMatch(/useSyncExternalStore/);
  });

  test('the bar swipes down (bottom), and up or down (Home, docked at the top); the icon is not on Zen', () => {
    const src = read('src/components/MiniPlayer.js');
    expect(src).toMatch(/usePanGesture\(\{[\s\S]*activeOffsetY: \[-10, 10\][\s\S]*failOffsetX/);
    expect(src).toMatch(/scheduleOnRN\(dismissMini\)/);
    expect(src).toMatch(/export function MiniPlayerFab/);
    expect(src).toMatch(/useSwipeAway\(placement\)/);
    const app = read('App.js');
    expect(app).toMatch(/route !== 'Zen' && <MiniPlayerFab \/>/);
    // Screens give back the room while it's hidden.
    expect(src).toMatch(/useActiveAudio\(\)\.kind != null && !dismissed/);
  });
});

describe('Home has a small profile avatar in its top right', () => {
  test('one tap opens Profile', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await bootIntoTabs(user);
    await openTab(user, 'Home');
    const shortcut = screen.getByTestId('home-profile-shortcut');
    expect(shortcut).toBeOnTheScreen();
    expect(screen.getByLabelText('Your profile')).toBeOnTheScreen();
    await user.press(shortcut);
    await advance(800);
    expect(screen.getByTestId('profile-edge-lighting')).toBeOnTheScreen();
  });

  test('it sits above the Zen button in the header, and works outside the Hub provider', () => {
    const home = read('src/screens/HomeScreen.js');
    expect(home.indexOf('<ProfileShortcut />')).toBeGreaterThan(0);
    expect(home.indexOf('<ProfileShortcut />')).toBeLessThan(home.indexOf('<ZenButton'));
    expect(read('src/components/display/ProfileShortcut.js')).toMatch(/useHubMaybe\(\)/);
  });
});

describe('Edge Lighting is on until you turn it off', () => {
  test('on by default, off only when chosen, and the choice is kept', async () => {
    await AsyncStorage.clear();
    let fresh;
    jest.isolateModules(() => {
      fresh = require('../src/data/edgeLighting');
    });
    await act(async () => {});
    expect(fresh.isEdgeLightingOn()).toBe(true);

    fresh.setEdgeLighting(false);
    expect(fresh.isEdgeLightingOn()).toBe(false);
    expect(await AsyncStorage.getItem('boa.edgeLighting.v1')).toBe('0');

    // The next launch reads the choice.
    let again;
    jest.isolateModules(() => {
      again = require('../src/data/edgeLighting');
    });
    await act(async () => {});
    expect(again.isEdgeLightingOn()).toBe(false);
    again.setEdgeLighting(true);
    expect(again.isEdgeLightingOn()).toBe(true);
    await AsyncStorage.clear();
  });

  test('a new listener pulses for a notification at once, throttled to one pulse per event', async () => {
    await AsyncStorage.clear();
    AppState.currentState = 'active';
    let edge;
    jest.isolateModules(() => {
      edge = require('../src/data/edgeLighting');
    });
    const pulses = jest.fn();
    const off = edge.onEdgePulse(pulses);
    expect(edge.triggerEdgeLighting('message', 10_000)).toBe(true);
    expect(edge.triggerEdgeLighting('message', 10_200)).toBe(false);
    expect(edge.triggerEdgeLighting('heart', 10_000 + edge.EDGE_MIN_GAP_MS + 1)).toBe(true);
    expect(pulses).toHaveBeenCalledTimes(2);
    off();
  });

  test('the overlay is mounted once at the root and hears every notification the app is shown', () => {
    const app = read('App.js');
    expect(app.match(/<EdgeLighting \/>/g)).toHaveLength(1);
    const overlay = read('src/components/EdgeLighting.js');
    expect(overlay).toMatch(/Notifications\.addNotificationReceivedListener/);
    // Only a ringing call (its own pulse), an alarm and the thread already open are skipped.
    expect(overlay).toMatch(/data\.type === 'chat' && data\.conversationId && data\.conversationId === getOpenThread\(\)/);
    expect(overlay).toMatch(/data\.type === 'call' \|\| !!data\.alarmId/);
  });
});

describe('every tap and tab switch is quick', () => {
  test('React Native 0.88 has no InteractionManager: nothing in the app calls it', () => {
    for (const f of ['App.js', 'src/audio/ambient.js']) expect(read(f)).not.toMatch(/InteractionManager/);
    // idle.js only names it in a comment.
    expect(read('src/utils/idle.js').replace(/^\/\/.*$/gm, '')).not.toMatch(/InteractionManager/);
  });

  test('the tab bar sets its hooks up before the Zen screensaver returns early', () => {
    const app = read('App.js');
    const bar = app.slice(app.indexOf('function FloatingTabBar'));
    expect(bar.indexOf('useEffect(')).toBeGreaterThan(0);
    expect(bar.indexOf('useEffect(')).toBeLessThan(bar.indexOf("if (route === 'Zen' && ambient) return null"));
  });

  test('tabs fade from 40% over 170 ms, and pages slide in 240 ms', () => {
    const { TAB_REST, TAB_SETTLE_MS } = require('../App');
    expect(TAB_REST).toBe(0.4);
    expect(TAB_SETTLE_MS).toBeLessThanOrEqual(180);
    expect(read('App.js')).toMatch(/animationDuration: 240/);
  });

  test('the other tabs are built ahead, one at a time, never Zen, and never over the Zen room', () => {
    const app = read('App.js');
    expect(app).toMatch(/const PRELOAD_TABS = \['Radio', 'Chat', 'Originals', 'Talent', 'Profile'\]/);
    expect(app).toMatch(/if \(routeRef\.current !== 'Zen'\) navigationRef\.current\.preload\?\.\(name\)/);
  });

  test('whenIdle runs the work in a quiet moment and can be cancelled', async () => {
    const { whenIdle } = require('../src/utils/idle');
    const work = jest.fn();
    whenIdle(work);
    await act(async () => jest.advanceTimersByTime(50));
    expect(work).toHaveBeenCalledTimes(1);
    const never = jest.fn();
    const cancel = whenIdle(never);
    cancel();
    await act(async () => jest.advanceTimersByTime(50));
    expect(never).not.toHaveBeenCalled();
  });
});

describe('video calls favour motion', () => {
  const q = require('../src/calls/quality');
  test('720p30, frame rate first, low latency, with cheap clean-up passes', () => {
    expect(q.HD).toMatchObject({ width: 1280, height: 720, fps: 30 });
    expect(q.ENCODER.frameRate).toBe(30);
    expect(q.ENCODER.degradationPreference).toBe(1);
    expect(q.ENCODER.advanceOptions.compressionPreference).toBe(0);
    expect(q.DENOISER.level).toBe(1);
    expect(q.LOW_LIGHT.level).toBe(1);
  });
});

describe('the first Zen frequency is the template; six now ship in the app', () => {
  test('frequency-1 to frequency-6 are bundled with require(), none downloaded', () => {
    const sleep = read('src/data/sleep.js');
    for (let n = 1; n <= 6; n++) {
      expect(sleep).toContain(`require('../../assets/zen/frequency-${n}.mp3')`);
      expect(fs.existsSync(path.join(__dirname, `../assets/zen/frequency-${n}.mp3`))).toBe(true);
    }
    expect(read('scripts/zen-masters.sh')).toMatch(/acrossfade/);
  });
});

// Unused import guard for eslint-less environments.
void within;
