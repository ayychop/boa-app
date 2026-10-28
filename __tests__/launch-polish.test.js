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

  test("Signature (0) is the old maximum: the codec's ceiling, full BassBoost and a louder ceiling", () => {
    expect(kt).toMatch(/MAX_MILLIBELS = 2400/);
    expect(kt).toMatch(/val up = min\(range\[1\]\.toInt\(\), MAX_MILLIBELS\)/);
    // At 0 both sliders are 1 of the way to the ceiling: the Equalizer at its top.
    expect(kt).toMatch(/val lowsUpTo = 1 \+ min\(lows, 0\.0\)/);
    expect(kt).toMatch(/\(lowsUpTo \* bassWeight\(hz\) \+ highsUpTo \* trebleWeight\(hz\)\) \* up/);
    expect(kt).toMatch(/bb\.setStrength\(\(lowsUpTo \* 1000\)/);
    expect(kt).toMatch(/SIGNATURE_GAIN_MILLIBELS = 600/);
    // -1 on both is flat: every effect off.
    expect(kt).toMatch(/val flat = lows <= -1\.0 && treble <= -1\.0/);
  });

  test('past Signature goes past the hardware: DynamicsProcessing adds more, with a limiter, and the volume climbs', () => {
    expect(kt).toMatch(/DynamicsProcessing\(0, sessionId, config\)/);
    expect(kt).toMatch(/EXTRA_BASS_DB = 12\.0/);
    expect(kt).toMatch(/EXTRA_TREBLE_DB = 6\.0/);
    expect(kt).toMatch(/DynamicsProcessing\.Limiter\(true, true, 0, LIMITER_ATTACK_MS, LIMITER_RELEASE_MS, LIMITER_RATIO, LIMITER_THRESHOLD_DB, 0f\)/);
    expect(kt).toMatch(/LIMITER_THRESHOLD_DB = -1f/);
    // Only on Android 9+, where it exists; older phones still get the louder ceiling.
    expect(kt).toMatch(/if \(Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.P\) dynamics = make/);
    expect(kt).toMatch(/MAX_SLIDER_GAIN_MILLIBELS = 1400/);
    expect(kt).toMatch(/BOOST_GAIN_MILLIBELS = 1800/);
    // LoudnessEnhancer is created last, so its limiter holds every peak before it.
    const order = ['Equalizer(0, sessionId)', 'dynamicsFor(sessionId)', 'BassBoost(0, sessionId)', 'LoudnessEnhancer(sessionId)'].map((x) => kt.indexOf(x));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('the sheet reads the sliders as Flat, Signature and the dB past it', () => {
    const { readout } = require('../src/components/radio/EqualizerSheet');
    expect(readout(-1, 'bass')).toBe('Flat');
    expect(readout(0, 'bass')).toBe('Signature');
    expect(readout(0, 'treble')).toBe('Signature');
    expect(readout(1, 'bass')).toBe('+12 dB');
    expect(readout(1, 'treble')).toBe('+6 dB');
    expect(readout(0.5, 'bass')).toBe('+6 dB');
    expect(readout(-0.4, 'bass')).toBe('-6 dB');
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
    // BeautyPanel alone: from its line to the end of the function (the Background panel follows it).
    const start = src.indexOf('function BeautyPanel');
    const panel = src.slice(start, src.indexOf('\n}\n', start));
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
