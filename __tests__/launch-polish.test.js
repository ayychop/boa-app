import fs from 'fs';
import path from 'path';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { Alert, AppState, Platform } from 'react-native';

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('the casting board', () => {
  const { talent } = require('../src/data/boaContent');
  const Headshot = require('../src/components/Headshot').default;

  test('Jeremy Benson, in full', () => {
    expect(talent.map((t) => t.name)).toContain('Jeremy Benson');
    expect(talent.some((t) => /Owusu/.test(t.name))).toBe(false);
  });

  test('the initials are gold, swept by a sheen clipped to the letters, and centred in the frame', async () => {
    await render(<Headshot person={talent[0]} width={160} ratio={4 / 5} />);
    expect(screen.getByLabelText('SG')).toBeOnTheScreen();
    const src = read('src/components/Headshot.js');
    expect(src).toMatch(/clipPath=\{`url\(#letters/);
    expect(src).toMatch(/textAnchor="middle"/);
    expect(src).toMatch(/withRepeat\(/);
    expect(src).toMatch(/useReducedMotion/);
  });
});

describe('BOA Hi-Fi at full power', () => {
  const kt = read('modules/boa-eq/android/src/main/java/expo/modules/boaeq/BoaEqModule.kt');

  test("every slider runs to the phone's own codec limit, and the limiter sits last", () => {
    expect(kt).toMatch(/MAX_MILLIBELS = 2400/);
    expect(kt).toMatch(/min\(range\[1\]\.toInt\(\), MAX_MILLIBELS\)/);
    expect(kt).toMatch(/lows \* 1000/);
    expect(kt).toMatch(/BOOST_GAIN_MILLIBELS = 1200/);
    expect(kt).toMatch(/SLIDER_GAIN_MILLIBELS/);
    // LoudnessEnhancer is created after the equalizer and BassBoost, so its limiter holds their peaks.
    expect(kt.indexOf('LoudnessEnhancer(sessionId)')).toBeGreaterThan(kt.indexOf('BassBoost(0, sessionId)'));
    expect(read('src/components/radio/EqualizerSheet.js')).toMatch(/v \* 15/);
  });
});

describe('Brightness and Contrast', () => {
  const { contrastLabel, exposureOf, fromStored, toStored, toneOf, toAgora } = require('../src/calls/beauty');
  const { tone, toneLutText } = require('../src/calls/luts');

  test('a small drag is already a real change, at the camera and in the tone curve', () => {
    expect(exposureOf(0.6)).toBeGreaterThan(4);
    expect(toneOf({ brightness: 0.51, contrast: 0.5 })).toEqual({ brightness: 1, contrast: 0 });
    expect(toneOf({ brightness: 0, contrast: 1 })).toEqual({ brightness: -10, contrast: 10 });
    expect(toAgora({ preset: 'natural', brightness: 0.5, contrast: 0.5 }).tone).toEqual({ brightness: 0, contrast: 0 });
  });

  test('the curve: Brightness lifts the mids, Contrast spreads them, black and white hold', () => {
    expect(tone(0.5, 10, 0)).toBeGreaterThan(0.7);
    expect(tone(0.5, -10, 0)).toBeLessThan(0.3);
    expect(tone(0, 10, 0)).toBe(0);
    expect(tone(1, 10, 0)).toBe(1);
    expect(tone(0.7, 0, 10)).toBeGreaterThan(0.9);
    expect(tone(0.3, 0, 10)).toBeLessThan(0.1);
    expect(tone(0.7, 0, -10)).toBeLessThan(0.6);
    expect(tone(0.4, 0, 0)).toBe(0.4);
    const lines = toneLutText(null, 0, 0, 0).split('\n');
    expect(lines[1]).toBe('LUT_3D_SIZE 32');
    expect(lines).toHaveLength(4 + 32 * 32 * 32 + 1);
  });

  test('Contrast is saved alongside Brightness, and labelled like it', () => {
    expect(toStored({ preset: 'golden', brightness: 0.7, contrast: 0.3, enabled: true })).toEqual(expect.objectContaining({ contrast: 0.3 }));
    expect(fromStored({ preset: 'golden', brightness: 0.7, contrast: 0.3, v: 2 }).contrast).toBe(0.3);
    expect(contrastLabel(0.5)).toBe('Normal');
    expect(contrastLabel(0.8)).toBe('+60');
  });

  test('the filter sheet: text-only presets, no colour circles', () => {
    const src = read('src/components/calls/CallScreen.js');
    const panel = src.slice(src.indexOf('function BeautyPanel'), src.indexOf('function SelfView'));
    expect(panel).not.toMatch(/PRESET_SWATCH|presetSwatch|LinearGradient/);
    expect(panel).toMatch(/kind="contrast"/);
  });
});

describe('full-screen calls, asked in BOA', () => {
  const BoaCall = require('../modules/boa-call');
  const CallWakeUpPrompt = require('../src/components/calls/CallWakeUpPrompt').default;
  const { askForCallWakeUp } = require('../src/calls/wakeUp');
  const os = Platform.OS;
  beforeEach(() => {
    Platform.OS = 'android';
  });
  afterEach(() => {
    Platform.OS = os;
    BoaCall.canUseFullScreen.mockReturnValue(true);
    jest.restoreAllMocks();
  });

  test('a BOA sheet explains why, opens the system setting, and confirms once it is on', async () => {
    const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default ?? jest.requireMock('@react-native-async-storage/async-storage');
    await AsyncStorage.clear();
    BoaCall.canUseFullScreen.mockReturnValue(false);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    let resume = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, fn) => {
      resume = fn;
      return { remove: () => {} };
    });
    const user = userEvent.setup();
    await render(<CallWakeUpPrompt />);
    await act(async () => askForCallWakeUp());
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByText('Never miss a BOA call.')).toBeOnTheScreen();
    await user.press(screen.getByTestId('call-wake-open'));
    expect(BoaCall.openFullScreenSettings).toHaveBeenCalled();
    BoaCall.canUseFullScreen.mockReturnValue(true);
    await act(async () => resume('active'));
    expect(screen.getByText("You're all set.")).toBeOnTheScreen();
  });
});
