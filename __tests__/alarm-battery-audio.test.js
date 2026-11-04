import fs from 'fs';
import path from 'path';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const flush = async () => {
  for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); });
};

// ---- the ringing screen -------------------------------------------------------

const mockAlarms = { ringing: { id: 'a1', name: 'Wake up', sound: { type: 'tone' } }, stop: jest.fn(), snooze: jest.fn() };
jest.mock('../src/context/AlarmContext', () => ({ useAlarms: () => mockAlarms }));

describe('the alarm screen answers the first touch', () => {
  const AlarmRingingScreen = require('../src/screens/AlarmRingingScreen').default;
  const nav = () => ({ goBack: jest.fn(), canGoBack: () => true });

  beforeEach(() => {
    mockAlarms.stop.mockClear();
    mockAlarms.snooze.mockClear();
    mockAlarms.ringing = { id: 'a1', name: 'Wake up', sound: { type: 'tone' } };
  });

  test('Stop acts the moment a finger lands, once, and the screen leaves', async () => {
    const navigation = nav();
    await render(<AlarmRingingScreen navigation={navigation} />);
    expect(screen.getByText('Wake up')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByTestId('alarm-stop'));
    // press-in and press both fired, the alarm was stopped exactly once.
    expect(mockAlarms.stop).toHaveBeenCalledTimes(1);
    expect(mockAlarms.snooze).not.toHaveBeenCalled();
    expect(navigation.goBack).toHaveBeenCalled();
  });

  test('Snooze is the same, and a second press does nothing more', async () => {
    const navigation = nav();
    await render(<AlarmRingingScreen navigation={navigation} />);
    const user = userEvent.setup();
    await user.press(screen.getByTestId('alarm-snooze'));
    await user.press(screen.getByTestId('alarm-snooze'));
    await user.press(screen.getByTestId('alarm-stop'));
    expect(mockAlarms.snooze).toHaveBeenCalledTimes(1);
    expect(mockAlarms.stop).not.toHaveBeenCalled();
  });

  test('a screen reader activating the button (a press with no press-in) works too', () => {
    const src = read('src/screens/AlarmRingingScreen.js');
    expect(src).toMatch(/onPressIn=\{\(\) => act\('stop'\)\}/);
    expect(src).toMatch(/onPress=\{\(\) => act\('stop'\)\}/);
    expect(src).toMatch(/onPressIn=\{\(\) => act\('snooze'\)\}/);
    expect(src).toMatch(/hitSlop=\{8\}/);
  });

  test('it pops up on a spring and leaves with a timed slide, with the sound already stopped', () => {
    const src = read('src/screens/AlarmRingingScreen.js');
    expect(src).toMatch(/withSpring\(1, POP_IN\)/);
    expect(src).toMatch(/withTiming\(0, \{ duration: reduce \? 120 : DISMISS_MS/);
    expect(src).toMatch(/scheduleOnRN\(close\)/);
    expect(src).toMatch(/entering=\{FadeInDown/);
    // The sound stops (stop()/snooze()) before leave() animates anything.
    expect(src.indexOf('stop();')).toBeLessThan(src.indexOf('leave();', src.indexOf('stop();')));
    // Reduce Motion is respected.
    expect(src).toMatch(/useReducedMotion/);
  });

  test('when it is dealt with elsewhere (the lock-screen page, the notification) the screen leaves by itself', async () => {
    const navigation = nav();
    const { rerender } = await render(<AlarmRingingScreen navigation={navigation} />);
    mockAlarms.ringing = null;
    await rerender(<AlarmRingingScreen navigation={navigation} />);
    expect(navigation.goBack).toHaveBeenCalled();
  });

  test('Stop and Snooze read the alarm that is ringing now, not a stale render', () => {
    const ctx = read('src/context/AlarmContext.js');
    expect(ctx).toMatch(/ringingRef\.current = ringing/);
    expect(ctx).toMatch(/const alarm = ringingRef\.current/);
    expect(ctx).toMatch(/\}, \[player, stopTone\]\);/);
  });
});

describe('the phone-side alarm page answers the first press', () => {
  const service = read('modules/boa-alarm/android/src/main/java/expo/modules/boaalarm/AlarmService.kt');
  const page = read('modules/boa-alarm/android/src/main/java/expo/modules/boaalarm/AlarmActivity.kt');

  test('Stop and Snooze go straight to the running service, on the main thread, not through a service start', () => {
    expect(service).toMatch(/@Volatile private var instance: AlarmService\? = null/);
    expect(service).toMatch(/Handler\(Looper\.getMainLooper\(\)\)\.post \{ live\.perform\(action\) \}/);
    expect(service).toMatch(/instance = this/);
    expect(service).toMatch(/if \(instance === this\) instance = null/);
    // The old path stays as the fallback.
    expect(service).toMatch(/c\.startService\(Intent\(c, AlarmService::class\.java\)\.setAction\(action\)\)/);
  });

  test('the page dims at once, counts a press once, and closes itself if the service never answers', () => {
    expect(page).toMatch(/private var acted = false/);
    expect(page).toMatch(/if \(acted\) return/);
    expect(page).toMatch(/root\.animate\(\)\.alpha\(0\.5f\)/);
    expect(page).toMatch(/postDelayed\(\{ if \(!isFinishing\) finish\(\) \}, 700L\)/);
    expect(page).toMatch(/act\(AlarmService\.ACTION_STOP\)/);
    expect(page).toMatch(/act\(AlarmService\.ACTION_SNOOZE\)/);
    expect(page).toMatch(/handler\.removeCallbacksAndMessages\(null\)/);
  });
});

// ---- the battery question ------------------------------------------------------

describe('battery optimisation: asked once, by the official intent, never nagged', () => {
  const BoaAlarm = require('../modules/boa-alarm');
  const battery = require('../src/utils/batteryExemption');
  let appStateHandler;

  beforeEach(async () => {
    await AsyncStorage.clear();
    BoaAlarm.__available = true;
    BoaAlarm.isIgnoringBatteryOptimizations.mockReset().mockReturnValue(false);
    BoaAlarm.requestIgnoreBatteryOptimizations.mockReset().mockReturnValue('dialog');
    BoaAlarm.openBatterySettings.mockClear();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, fn) => {
      appStateHandler = fn;
      return { remove: jest.fn() };
    });
  });
  afterEach(() => {
    jest.useRealTimers();
    BoaAlarm.__available = false;
  });

  // The user goes to Android's box and comes back.
  const answer = async (allowed) => {
    BoaAlarm.isIgnoringBatteryOptimizations.mockReturnValue(allowed);
    await flush();
    act(() => appStateHandler('background'));
    act(() => appStateHandler('active'));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
  };

  test('nothing to ask where the phone already lets BOA run, or where this build cannot ask', async () => {
    BoaAlarm.isIgnoringBatteryOptimizations.mockReturnValue(true);
    expect(await battery.batteryStatus()).toBe('granted');
    expect(await battery.requestBatteryExemption()).toBe('granted');
    expect(BoaAlarm.requestIgnoreBatteryOptimizations).not.toHaveBeenCalled();
    BoaAlarm.isIgnoringBatteryOptimizations.mockReturnValue(null);
    expect(await battery.batteryStatus()).toBe('unsupported');
  });

  test('asks once with the official box; a "no" is remembered and never asked again by itself', async () => {
    jest.useFakeTimers();
    expect(await battery.batteryStatus()).toBe('pending');
    const first = battery.requestBatteryExemption();
    await answer(false);
    expect(await first).toBe('declined');
    expect(BoaAlarm.requestIgnoreBatteryOptimizations).toHaveBeenCalledTimes(1);
    expect(await battery.batteryStatus()).toBe('declined');
    // Again and again: not once more.
    expect(await battery.requestBatteryExemption()).toBe('declined');
    expect(await battery.requestBatteryExemption()).toBe('declined');
    expect(BoaAlarm.requestIgnoreBatteryOptimizations).toHaveBeenCalledTimes(1);
  });

  test('a yes ends it', async () => {
    jest.useFakeTimers();
    const first = battery.requestBatteryExemption();
    await answer(true);
    expect(await first).toBe('granted');
    expect(await battery.batteryStatus()).toBe('granted');
  });

  test('only a tap on the quiet line asks again, and the tip can be closed for good', async () => {
    jest.useFakeTimers();
    const first = battery.requestBatteryExemption();
    await answer(false);
    await first;
    const again = battery.requestBatteryExemption({ byUser: true });
    await answer(false);
    expect(await again).toBe('declined');
    expect(BoaAlarm.requestIgnoreBatteryOptimizations).toHaveBeenCalledTimes(2);
    expect(await battery.batteryTipDismissed()).toBe(false);
    await battery.dismissBatteryTip();
    expect(await battery.batteryTipDismissed()).toBe(true);
  });

  test('a phone with no such box falls back to its settings only when the user asked', async () => {
    BoaAlarm.requestIgnoreBatteryOptimizations.mockReturnValue('none');
    expect(await battery.requestBatteryExemption()).toBe('declined');
    expect(BoaAlarm.openBatterySettings).not.toHaveBeenCalled();
    await AsyncStorage.clear();
    expect(await battery.requestBatteryExemption({ byUser: true })).toBe('declined');
    expect(BoaAlarm.openBatterySettings).toHaveBeenCalledTimes(1);
  });

  test('native: opens the battery list (Google Play restricts the one-tap box), and no module declares its permission', () => {
    const kt = read('modules/boa-alarm/android/src/main/java/expo/modules/boaalarm/BoaAlarmModule.kt');
    expect(kt).not.toMatch(/Settings\.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS/);
    expect(kt).toMatch(/Settings\.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS/);
    expect(kt).toMatch(/isIgnoringBatteryOptimizations\(context\.packageName\)/);
    // Alarms ring through Doze with setAlarmClock, so the restricted permission is declared nowhere
    // (and app.json removes it from anything a library merges in).
    expect(JSON.parse(read('app.json')).expo.android.permissions).not.toContain('android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS');
    expect(JSON.parse(read('app.json')).expo.android.blockedPermissions).toContain('android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS');
    for (const file of ['modules/boa-alarm/android/src/main/AndroidManifest.xml', 'modules/boa-call/android/src/main/AndroidManifest.xml']) {
      expect(read(file)).not.toMatch(/<uses-permission[^>]*REQUEST_IGNORE_BATTERY_OPTIMIZATIONS/);
    }
    expect(read('modules/boa-call/android/src/main/AndroidManifest.xml')).not.toMatch(/BATTERY/);
  });

  test('Alarm Settings asks only when a radio alarm is first turned on, not whenever it opens', () => {
    const src = read('src/screens/AlarmSettingsScreen.js');
    expect(src).toMatch(/if \(before === null \|\| stationAlarms <= before\) return/);
    expect(src).toMatch(/requestBatteryExemption\(\)\.then\(setBattery\)/);
    expect(src).toMatch(/requestBatteryExemption\(\{ byUser: true \}\)/);
    expect(src).toMatch(/alarm-battery-tip-close/);
    expect(src).not.toMatch(/onPress=\{\(\) => BoaAlarm\.openBatterySettings\(\)\}/);
  });
});

// ---- car audio levels ---------------------------------------------------------

describe('car, USB and Bluetooth hit harder, without clipping', () => {
  const kt = read('modules/boa-eq/android/src/main/java/expo/modules/boaeq/BoaEqModule.kt');

  test('the car, USB and Bluetooth extras are above the old maximums', () => {
    // Old: car 6/3 dB + 500 mB, Bluetooth 4/3 dB + 400 mB.
    expect(kt).toMatch(/CAR_EXTRA_BASS_DB = 9\.0/);
    expect(kt).toMatch(/CAR_EXTRA_TREBLE_DB = 4\.0/);
    expect(kt).toMatch(/CAR_EXTRA_GAIN_MILLIBELS = 900/);
    expect(kt).toMatch(/USB_EXTRA_BASS_DB = 8\.0/);
    expect(kt).toMatch(/USB_EXTRA_GAIN_MILLIBELS = 800/);
    expect(kt).toMatch(/BT_EXTRA_BASS_DB = 7\.0/);
    expect(kt).toMatch(/BT_EXTRA_GAIN_MILLIBELS = 700/);
    // The sub-bass (under 120 Hz) is weighted up more.
    expect(kt).toMatch(/CAR_SUB_WEIGHT = 1\.5/);
    expect(kt).toMatch(/BT_SUB_WEIGHT = 1\.4/);
  });

  test('more room before the limiter on those routes, and a ceiling on the volume lift', () => {
    expect(kt).toMatch(/headroomShare: Double/);
    expect(kt).toMatch(/\* profile\.headroomShare\)/);
    expect(kt).toMatch(/CAR_HEADROOM_SHARE = 0\.65/);
    expect(kt).toMatch(/PHONE = Profile\(0\.0, 0\.0, 1\.0, 0\.0, 0, false, HEADROOM_SHARE\)/);
    expect(kt).toMatch(/min\(base \+ profile\.extraGainMillibels, ROUTE_GAIN_CEILING_MILLIBELS\)/);
    // The limiter still ends the chain.
    expect(kt).toMatch(/LIMITER_THRESHOLD_DB = -1f/);
    expect(kt.indexOf('loudness = make("loudness enhancer")')).toBeGreaterThan(kt.indexOf('virtualizer = make("virtualizer")'));
    // The phone's own sound is untouched.
    expect(kt).toMatch(/else -> PHONE/);
  });

  test('USB is its own route (a DAC or a head unit on a cable) and the sheet shows it', () => {
    expect(kt).toMatch(/TYPE_USB_DEVICE, AudioDeviceInfo\.TYPE_USB_ACCESSORY/);
    expect(kt).toMatch(/usbOut\(c\) -> "usb"/);
    expect(kt).toMatch(/cabled -> USB/);
    expect(read('src/components/radio/EqualizerSheet.js')).toMatch(/usb: 'USB'/);
    expect(read('modules/boa-eq/index.js')).toMatch(/'usb'/);
  });
});

// ---- the audio guard ------------------------------------------------------------

describe('BOA Radio and calls', () => {
  const src = read('src/audio/interruptions.js');
  const guardKt = read('modules/boa-audio-guard/android/src/main/java/expo/modules/boaaudioguard/BoaAudioGuardModule.kt');
  const service = read('modules/boa-audio-guard/android/src/main/java/expo/modules/boaaudioguard/BoaTaskGuardService.kt');

  test('the radio pauses at once for a call, from any app, and resumes after it', () => {
    expect(src).toMatch(/engine\.interrupt\('call'\)/);
    expect(src).toMatch(/engine\.endInterruption\('call'\)/);
    expect(guardKt).toMatch(/MODE_IN_COMMUNICATION|IN_COMMUNICATION/);
    expect(guardKt).toMatch(/addOnModeChangedListener/);
  });

  test('swiping the app away stops the radio, unless a car is connected', () => {
    expect(read('modules/boa-audio-guard/android/src/main/AndroidManifest.xml')).toMatch(/android:stopWithTask="false"/);
    expect(service).toMatch(/onTaskRemoved/);
    expect(service).toMatch(/CarLink\.connected/);
    expect(service).toMatch(/Process\.killProcess/);
  });

  test('audio focus: a lost focus pauses, a transient loss resumes', () => {
    expect(read('src/audio/session.js')).toMatch(/doNotMixPersistent/);
  });
});
