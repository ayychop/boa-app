import fs from 'fs';
import path from 'path';
import { Text, AppState } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const KT = 'modules/boa-alarm/android/src/main/java/expo/modules/boaalarm/';

const mockPlayer = { play: jest.fn(), pause: jest.fn() };
jest.mock('../src/context/PlayerContext', () => ({ usePlayer: () => mockPlayer }));

const BoaAlarm = require('../modules/boa-alarm');
const { AlarmProvider, useAlarms, isNativeRadio, newAlarm } = require('../src/context/AlarmContext');

const station = { kind: 'radio', id: 's1', name: 'Softlife Radio', streamUrl: 'https://a10.example.com/radio.mp3' };
const radioAlarm = (over = {}) => newAlarm({ id: 'a-radio', hour: 8, minute: 30, days: [1, 2, 3, 4, 5], sound: { type: 'station', station }, ...over });

let ctx;
function Probe() {
  ctx = useAlarms();
  return <Text testID="ringing">{ctx.ringing ? ctx.ringing.id : 'none'}</Text>;
}
const mount = async () => {
  await render(
    <AlarmProvider>
      <Probe />
    </AlarmProvider>,
  );
  await act(async () => {});
};

beforeEach(async () => {
  jest.clearAllMocks();
  BoaAlarm.__available = true;
  BoaAlarm.current.mockReturnValue(null);
  BoaAlarm.takeFired.mockReturnValue([]);
  await AsyncStorage.clear();
});
afterAll(() => {
  BoaAlarm.__available = false;
});

describe('the radio alarm rings with the app closed (native)', () => {
  test('a station alarm is handed to the phone, and no second notification is scheduled', async () => {
    await mount();
    await act(async () => ctx.save(radioAlarm()));
    await act(async () => {});
    const sent = BoaAlarm.sync.mock.calls.at(-1)[0];
    expect(sent).toEqual([expect.objectContaining({ id: 'a-radio', hour: 8, minute: 30, days: [1, 2, 3, 4, 5], station: 'Softlife Radio', url: station.streamUrl })]);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('a tone alarm is still a notification, and is not sent to the phone', async () => {
    await mount();
    await act(async () => ctx.save(newAlarm({ id: 'a-tone', days: [1] })));
    await act(async () => {});
    expect(BoaAlarm.sync.mock.calls.at(-1)[0]).toEqual([]);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
  });

  test('without the native module a radio alarm stays a notification', async () => {
    BoaAlarm.__available = false;
    expect(isNativeRadio(radioAlarm())).toBe(false);
    await mount();
    await act(async () => ctx.save(radioAlarm()));
    await act(async () => {});
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
  });

  test('turning an alarm off or deleting it sets the phone\'s list again, without it', async () => {
    await mount();
    await act(async () => ctx.save(radioAlarm()));
    await act(async () => ctx.toggle('a-radio'));
    await act(async () => {});
    expect(BoaAlarm.sync.mock.calls.at(-1)[0]).toEqual([]);
  });

  test('the phone ringing shows the screen and does not start a second player', async () => {
    await mount();
    await act(async () => ctx.save(radioAlarm()));
    await act(async () => {
      BoaAlarm.__emit({ state: 'ringing', id: 'a-radio', name: 'Wake up', station: 'Softlife Radio' });
    });
    expect(screen.getByTestId('ringing').props.children).toBe('a-radio');
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  test('Stop and Snooze go to the phone; stopping from the notification closes the screen', async () => {
    await mount();
    await act(async () => ctx.save(radioAlarm()));
    await act(async () => BoaAlarm.__emit({ state: 'ringing', id: 'a-radio', name: 'x', station: 'y' }));
    await act(async () => ctx.stop());
    expect(BoaAlarm.stop).toHaveBeenCalled();
    expect(mockPlayer.pause).not.toHaveBeenCalled();

    await act(async () => BoaAlarm.__emit({ state: 'ringing', id: 'a-radio', name: 'x', station: 'y' }));
    await act(async () => ctx.snooze());
    expect(BoaAlarm.snooze).toHaveBeenCalled();

    await act(async () => BoaAlarm.__emit({ state: 'ringing', id: 'a-radio', name: 'x', station: 'y' }));
    await act(async () => BoaAlarm.__emit({ state: 'stopped', id: 'a-radio' }));
    expect(screen.getByTestId('ringing').props.children).toBe('none');
  });

  test('opened while it is already ringing: the screen comes up', async () => {
    BoaAlarm.current.mockReturnValue({ id: 'a-radio', name: 'Wake up', station: 'Softlife Radio' });
    await mount();
    expect(screen.getByTestId('ringing').props.children).toBe('a-radio');
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  test('a once-only alarm that rang while the app was closed is off when it opens', async () => {
    await AsyncStorage.setItem('boa.alarms.v1', JSON.stringify([radioAlarm({ days: [] })]));
    BoaAlarm.takeFired.mockReturnValue(['a-radio']);
    await mount();
    expect(ctx.alarms[0].enabled).toBe(false);
  });
});

describe('exact alarm permission (Android 12+)', () => {
  test('the app asks when an alarm is saved and exact alarms are off', async () => {
    Notifications.getExactAlarmPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    Notifications.getPermissionsAsync.mockResolvedValue({ granted: true });
    const { Platform } = require('react-native');
    const was = Platform.OS;
    Platform.OS = 'android';
    try {
      await mount();
      expect(ctx.exact).toBe('denied');
      Notifications.getPermissionsAsync.mockResolvedValue({ granted: true });
      await act(async () => {
        await ctx.askPermission();
      });
      await act(async () => ctx.save(radioAlarm()));
      expect(Notifications.requestExactAlarmPermissionsAsync).toHaveBeenCalled();
    } finally {
      Platform.OS = was;
      Notifications.getExactAlarmPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    }
  });

  test('the config declares the permissions and the native pieces', () => {
    const app = JSON.parse(read('app.json')).expo.android.permissions;
    expect(app).toEqual(expect.arrayContaining(['android.permission.SCHEDULE_EXACT_ALARM', 'android.permission.RECEIVE_BOOT_COMPLETED', 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK']));
    const mf = read('modules/boa-alarm/android/src/main/AndroidManifest.xml');
    expect(mf).toMatch(/foregroundServiceType="mediaPlayback"/);
    expect(mf).toMatch(/BOOT_COMPLETED/);
    expect(mf).toMatch(/MY_PACKAGE_REPLACED/);
    expect(mf).toMatch(/AlarmActivity/);
    expect(mf).toMatch(/showWhenLocked="true"/);
  });
});

describe('the native alarm (source guards: Kotlin cannot run in jest)', () => {
  test('exact system alarm that survives Doze, with the permission check and a fallback', () => {
    const k = read(`${KT}AlarmScheduler.kt`);
    expect(k).toMatch(/setAlarmClock\(AlarmManager\.AlarmClockInfo/);
    expect(k).toMatch(/canScheduleExactAlarms\(\)/);
    expect(k).toMatch(/setAndAllowWhileIdle/);
    expect(k).toMatch(/catch \(_: SecurityException\)/);
  });
  test('it rings by itself: the receiver starts the service, repeating alarms set the next ring first', () => {
    const k = read(`${KT}AlarmReceiver.kt`);
    expect(k).toMatch(/AlarmService\.start\(context, alarm\)/);
    expect(k).toMatch(/AlarmScheduler\.schedule\(context, alarm\)/);
    expect(k).toMatch(/markFired/);
    expect(k).toMatch(/class AlarmBootReceiver/);
    expect(k).toMatch(/rescheduleAll/);
  });
  test('the service is a media-playback foreground service with alarm audio, a wake lock and a never-silent fallback', () => {
    const k = read(`${KT}AlarmService.kt`);
    expect(k).toMatch(/FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK/);
    expect(k).toMatch(/USAGE_ALARM/);
    expect(k).toMatch(/PARTIAL_WAKE_LOCK/);
    expect(k).toMatch(/setFullScreenIntent/);
    expect(k).toMatch(/ensureTone\(\)/);
    expect(k).toMatch(/alarm_chimes/);
    expect(k).toMatch(/START_REDELIVER_INTENT/);
    expect(k).toMatch(/MAX_RING_MS = 30 \* 60_000L/);
    expect(k).toMatch(/Snooze \$SNOOZE_MINUTES min/);
    expect(k).toMatch(/promote\(a\)\s*\n\s*if \(ringing\)/);
  });
  test('a dropped stream retries while the chimes cover it', () => {
    const k = read(`${KT}AlarmService.kt`);
    expect(k).toMatch(/setOnErrorListener/);
    expect(k).toMatch(/setOnCompletionListener/);
    expect(k).toMatch(/private fun retry\(\)/);
  });
  test('the lock-screen page and the module are registered', () => {
    expect(read(`${KT}AlarmActivity.kt`)).toMatch(/setShowWhenLocked\(true\)/);
    expect(read(`${KT}BoaAlarmModule.kt`)).toMatch(/Name\("BoaAlarm"\)/);
    expect(read('modules/boa-alarm/expo-module.config.json')).toMatch(/expo\.modules\.boaalarm\.BoaAlarmModule/);
  });
  test('the next ring is computed like the app does (days 0 = Sunday)', () => {
    const k = read(`${KT}AlarmScheduler.kt`);
    expect(k).toMatch(/get\(Calendar\.DAY_OF_WEEK\) - 1/);
  });
});

describe('Edge Lighting', () => {
  const edge = require('../src/data/edgeLighting');
  const EdgeLighting = require('../src/components/EdgeLighting').default;
  const { EDGE_PULSE_MS } = require('../src/components/EdgeLighting');

  const arrive = async (data = {}) => {
    const call = Notifications.addNotificationReceivedListener.mock.calls.at(-1);
    expect(call).toBeTruthy();
    await act(async () => call[0]({ request: { content: { data } } }));
  };

  beforeEach(() => {
    edge.setEdgeLighting(false);
    AppState.currentState = 'active';
  });
  afterEach(() => {
    AppState.currentState = 'active';
    jest.useRealTimers();
  });

  test('off by default and saved', async () => {
    expect(edge.isEdgeLightingOn()).toBe(false);
    edge.setEdgeLighting(true);
    expect(await AsyncStorage.getItem('boa.edgeLighting.v1')).toBe('1');
  });

  test('a notification with the app open pulses the rim when it is on', async () => {
    jest.useFakeTimers();
    edge.setEdgeLighting(true);
    await render(<EdgeLighting />);
    expect(screen.queryByTestId('edge-lighting', { includeHiddenElements: true })).toBeNull();
    await arrive({ type: 'chat' });
    expect(screen.getByTestId('edge-lighting', { includeHiddenElements: true })).toBeTruthy();
    // When the lap finishes, nothing is left on screen or running.
    await act(async () => {
      jest.advanceTimersByTime(EDGE_PULSE_MS + 200);
    });
    expect(screen.queryByTestId('edge-lighting', { includeHiddenElements: true })).toBeNull();
  });

  test('the toggle\'s preview pulses too, even before any notification', async () => {
    // The toggle turns it on, then asks for the preview.
    edge.setEdgeLighting(true);
    await render(<EdgeLighting />);
    await act(async () => edge.pulseEdgeLighting());
    expect(screen.getByTestId('edge-lighting', { includeHiddenElements: true })).toBeTruthy();
  });

  test('nothing when it is off, in the background, or for calls and alarms', async () => {
    await render(<EdgeLighting />);
    await arrive({ type: 'chat' });
    expect(screen.queryByTestId('edge-lighting', { includeHiddenElements: true })).toBeNull();

    edge.setEdgeLighting(true);
    await arrive({ type: 'call' });
    await arrive({ alarmId: 'x' });
    expect(screen.queryByTestId('edge-lighting', { includeHiddenElements: true })).toBeNull();

    AppState.currentState = 'background';
    await arrive({ type: 'chat' });
    expect(screen.queryByTestId('edge-lighting', { includeHiddenElements: true })).toBeNull();
  });

  test('turning it off clears a pulse at once', async () => {
    edge.setEdgeLighting(true);
    await render(<EdgeLighting />);
    await arrive({ type: 'chat' });
    await act(async () => edge.setEdgeLighting(false));
    expect(screen.queryByTestId('edge-lighting', { includeHiddenElements: true })).toBeNull();
  });

  test('the rim is a rounded rectangle path with a measured length', () => {
    const { rimOf } = require('../src/components/EdgeLighting');
    const r = rimOf(400, 800, 3, 38);
    expect(r.w).toBe(394);
    expect(r.h).toBe(794);
    expect(r.perimeter).toBeCloseTo(2 * (394 + 794) - 8 * 38 + 2 * Math.PI * 38, 5);
  });

  test('Profile has an Edge Lighting section with a switch', () => {
    const p = read('src/screens/ProfileScreen.js');
    expect(p).toMatch(/Edge Lighting<\/Slate>/);
    expect(p).toMatch(/testID="edge-lighting-toggle"/);
    expect(p).toMatch(/setEdgeLighting\(on\)/);
    expect(read('App.js')).toMatch(/<EdgeLighting \/>/);
  });
});
