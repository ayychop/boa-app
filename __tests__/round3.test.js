import { screen, userEvent } from '@testing-library/react-native';
import { AppState } from 'react-native';
import * as fs from 'fs';
import * as path from 'path';
import * as engine from '../src/audio/engine';
import * as ambient from '../src/audio/ambient';
import * as screenEvents from '../modules/boa-screen';
import * as video from 'expo-video';
import * as loop from '../src/utils/loop';
import { advance, bootIntoTabs, instrument, openTab, PORTRAIT, setWindow } from './helpers';

jest.useFakeTimers();

let probe;
beforeEach(async () => {
  probe = instrument();
  AppState.currentState = 'active';
  await setWindow(PORTRAIT);
  ambient.stop();
  jest.clearAllMocks();
  screenEvents.unlock.mockReset().mockImplementation(async () => true);
});

afterEach(() => {
  expect(probe.errors).toEqual([]);
  jest.restoreAllMocks();
});

const radioState = () => {
  let s;
  engine.subscribe((x) => (s = x))();
  return s;
};

describe('one sound at a time', () => {
  test('pressing play on the radio stops the Zen soundscape at once, and its card stops animating', async () => {
    const user = userEvent.setup();
    await bootIntoTabs(user);
    await openTab(user, 'Zen');
    await user.press(screen.getByRole('button', { name: 'Play Deep sleep' }));
    await advance(200);
    expect(ambient.getState().status).toBe('playing');

    await openTab(user, 'Home');
    const station = screen.getAllByRole('button', { name: /^Play / })[0];
    await user.press(station);
    await advance(300);
    expect(ambient.getState().status).toBe('paused');
    expect(radioState().status).toBe('playing');

    await openTab(user, 'Zen');
    // The card shows it as stopped (Play, not Pause), so its equalizer is gone.
    expect(screen.getByRole('button', { name: 'Play Deep sleep' })).toBeOnTheScreen();
  });

  test('tapping a soundscape while the radio plays pauses the radio at once', async () => {
    const user = userEvent.setup();
    await bootIntoTabs(user);
    await user.press(screen.getAllByRole('button', { name: /^Play / })[0]);
    await advance(300);
    expect(radioState().status).toBe('playing');

    await openTab(user, 'Zen');
    await user.press(screen.getByRole('button', { name: 'Play Rain' }));
    await advance(200);
    expect(engine.pause).toHaveBeenCalled();
    expect(radioState().status).toBe('paused');
    expect(ambient.getState()).toMatchObject({ id: 'rain', status: 'playing' });
  });
});

test('leaving the Zen tab unmounts the whole room (no loop left running); coming back starts it fresh', async () => {
  let running = 0;
  const starts = [];
  jest.spyOn(loop, 'startLoop').mockImplementation((value) => {
    running += 1;
    starts.push(value.value);
    return () => {
      running -= 1;
    };
  });
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await openTab(user, 'Zen');
  await advance(300);
  expect(screen.getByTestId('zen-screen')).toBeOnTheScreen();
  expect(running).toBeGreaterThanOrEqual(5);

  await openTab(user, 'Radio');
  await advance(300);
  // Nothing of Zen is left mounted, so nothing of it animates.
  expect(screen.queryByTestId('zen-screen')).toBeNull();
  expect(screen.queryByTestId('zen-panel')).toBeNull();
  expect(running).toBe(0);

  starts.length = 0;
  await openTab(user, 'Zen');
  await advance(300);
  expect(screen.getByTestId('zen-screen')).toBeOnTheScreen();
  expect(running).toBeGreaterThanOrEqual(5);
  // Every loop begins again from the start.
  expect(starts.length).toBeGreaterThanOrEqual(5);
  expect(starts.every((v) => v === 0)).toBe(true);
});

test('while the radio plays, the whole Zen background freezes, and moves again once it stops', async () => {
  // Every background loop (mesh, photo, smoke, grain) goes through startLoop.
  let running = 0;
  jest.spyOn(loop, 'startLoop').mockImplementation(() => {
    running += 1;
    return () => {
      running -= 1;
    };
  });
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await openTab(user, 'Zen');
  await advance(300);
  expect(running).toBeGreaterThanOrEqual(5);
  const scene = () => video.__players[video.__players.length - 1];
  expect(scene().playing).toBe(true);

  // The radio comes on (from Zen's own controls, after picking a station).
  await openTab(user, 'Home');
  await user.press(screen.getAllByRole('button', { name: /^Play / })[0]);
  await advance(300);
  await openTab(user, 'Zen');
  await advance(300);
  expect(running).toBe(0);
  expect(scene().playing).toBe(false);

  await user.press(screen.getByRole('button', { name: 'Pause radio' }));
  await advance(300);
  expect(running).toBeGreaterThanOrEqual(5);
  expect(scene().playing).toBe(true);
});

test("the screensaver's soundscape button opens the full Zen page, not the tab you locked on", async () => {
  const user = userEvent.setup();
  await bootIntoTabs(user);
  await openTab(user, 'Zen');
  await user.press(screen.getByRole('button', { name: 'Play Deep sleep' }));
  await advance(200);
  await openTab(user, 'Talent');
  await probe.lock();
  await advance(300);
  await probe.unlock();
  expect(screen.getByTestId('zen-screensaver')).toBeOnTheScreen();

  await user.press(screen.getByTestId('zen-screensaver-sound'));
  await advance(400);
  expect(screenEvents.unlock).toHaveBeenCalled();
  expect(screen.getByTestId('zen-screen')).toBeOnTheScreen();
  expect(screen.getByTestId('zen-panel')).toBeOnTheScreen();
  expect(screen.queryByTestId('talent-scroll')).toBeNull();
  // Still playing: you came to Zen for it.
  expect(ambient.getState().status).toBe('playing');
});

describe('deep links and the widget', () => {
  const root = path.join(__dirname, '..');
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

  test('the app scheme is network.boa, and no old boa:// links are left', () => {
    expect(JSON.parse(read('app.json')).expo.scheme).toBe('network.boa');
    for (const p of ['src/api/hub.js', 'src/context/AlarmContext.js', 'plugins/widget/BoaWidgetProvider.kt']) {
      expect(read(p)).not.toMatch(/(^|[^.\w])boa:\/\//m);
    }
    expect(read('plugins/widget/BoaWidgetProvider.kt')).toContain('network.boa://now-playing');
  });

  test('the widget layout only uses views a home screen widget can show', () => {
    // RemoteViews' allowed classes; anything else and the launcher says
    // "Couldn't add widget".
    const allowed = new Set([
      'FrameLayout', 'LinearLayout', 'RelativeLayout', 'GridLayout', 'AnalogClock', 'Button', 'Chronometer',
      'ImageButton', 'ImageView', 'ProgressBar', 'TextView', 'ViewFlipper', 'ListView', 'GridView', 'StackView',
      'AdapterViewFlipper', 'ViewStub', 'TextClock',
    ]);
    const tags = [...read('plugins/widget/res/layout/boa_widget.xml').matchAll(/<([A-Za-z.]+)[\s>]/g)].map((m) => m[1]);
    expect(tags.length).toBeGreaterThan(10);
    expect(tags.filter((t) => !allowed.has(t))).toEqual([]);
  });

  test('every view id the provider sets exists in the layout, and the provider info points at it', () => {
    const layout = read('plugins/widget/res/layout/boa_widget.xml');
    const ids = new Set([...layout.matchAll(/@\+id\/(\w+)/g)].map((m) => m[1]));
    const used = new Set([...read('plugins/widget/BoaWidgetProvider.kt').matchAll(/R\.id\.(\w+)/g)].map((m) => m[1]));
    expect([...used].filter((id) => !ids.has(id))).toEqual([]);
    const info = read('plugins/widget/res/xml/boa_widget_info.xml');
    expect(info).toContain('android:initialLayout="@layout/boa_widget"');
    expect(Number(info.match(/minWidth="(\d+)dp"/)[1])).toBeGreaterThan(0);
    expect(Number(info.match(/minHeight="(\d+)dp"/)[1])).toBeGreaterThan(0);
  });

  test('the widget receiver is registered with the update action and its provider info', async () => {
    const actual = jest.requireActual('expo/config-plugins');
    const { AndroidConfig } = actual;
    let manifest = { manifest: { application: [{ $: { 'android:name': '.MainApplication' } }] } };
    let withBoaWidget;
    jest.isolateModules(() => {
      jest.doMock('expo/config-plugins', () => ({
        ...actual,
        withDangerousMod: (config) => config,
        withAndroidManifest: (config, fn) => {
          manifest = fn({ ...config, modResults: manifest }).modResults;
          return config;
        },
      }));
      withBoaWidget = require('../plugins/withBoaWidget');
    });
    withBoaWidget({ android: { package: 'com.boanetsteam.boaapp' } });
    const receiver = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest).receiver.find(
      (r) => r.$['android:name'] === '.BoaWidgetProvider',
    );
    expect(receiver.$['android:exported']).toBe('false');
    expect(receiver['intent-filter'][0].action[0].$['android:name']).toBe('android.appwidget.action.APPWIDGET_UPDATE');
    expect(receiver['meta-data'][0].$).toEqual({ 'android:name': 'android.appwidget.provider', 'android:resource': '@xml/boa_widget_info' });
  });
});
