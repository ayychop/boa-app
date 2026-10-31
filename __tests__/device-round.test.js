import fs from 'fs';
import path from 'path';
import { act, render, screen, userEvent } from '@testing-library/react-native';

jest.useFakeTimers();

// The Schedule list's data, stood in.
let mockUpcoming = [];
const mockOpen = jest.fn();
jest.mock('../src/api/scheduledCalls', () => ({
  listUpcoming: jest.fn(async () => mockUpcoming),
  subscribeMine: jest.fn(() => () => {}),
}));
jest.mock('../src/api/hub', () => ({
  ...jest.requireActual('../src/api/hub'),
  getProfile: jest.fn(async () => ({ id: 'kofi', username: 'kofi', display_name: 'Kofi Boateng' })),
}));
jest.mock('../src/calls/openRoom', () => ({ openScheduledCall: (...a) => mockOpen(...a) }));

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('the media cache only ever holds whole files', () => {
  test('a download lands in .part and is moved into place; a failed one leaves nothing', async () => {
    const { File, __files } = require('expo-file-system');
    const { cachedSource } = require('../src/utils/mediaCache');
    File.downloadFileAsync.mockClear();

    const ok = await cachedSource('scenes', 'ok-v2.mov', 'https://example.test/ok.mov');
    expect(File.downloadFileAsync.mock.calls[0][1].uri).toBe('file:///cache/scenes/ok-v2.mov');
    expect(ok.uri).toBe('file:///cache/scenes/ok-v2.mov');
    expect(__files.has('file:///cache/scenes/ok-v2.mov')).toBe(true);
    expect(__files.has('file:///cache/scenes/ok-v2.mov.part')).toBe(false);

    // A download that dies half way: the partial file is removed, and playback streams instead.
    const real = File.downloadFileAsync.getMockImplementation();
    File.downloadFileAsync.mockImplementationOnce(async (url, dest) => {
      __files.set(dest.uri, 17);
      throw new Error('connection lost');
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = await cachedSource('scenes', 'bad-v2.mov', 'https://example.test/bad.mov');
    expect(bad.uri).toBe('https://example.test/bad.mov');
    expect([...__files.keys()].filter((k) => k.includes('bad-v2'))).toEqual([]);
    File.downloadFileAsync.mockImplementation(real);
  });

  test('the source downloads to a .part file first', () => {
    const src = read('src/utils/mediaCache.js');
    expect(src).toMatch(/\$\{name\}\.part/);
    expect(src).toMatch(/await part\.move\(file\)/);
  });
});

describe('Zen hardening', () => {
  const zen = read('src/screens/ZenScreen.js');
  test('no layout-exit animations in the room, and the scene crossfade is plain opacity', () => {
    expect(zen).not.toMatch(/exiting=/);
    expect(zen).toMatch(/function SceneStack/);
  });
  test('the video and the picker sit behind error boundaries, and the video starts after the transition', () => {
    expect(zen).toMatch(/class LayerBoundary/);
    expect(zen).toMatch(/<LayerBoundary>\s*<ScreensaverPicker \/>/);
    expect(zen).toMatch(/VIDEO_DELAY_MS/);
  });
  test('the soundscape warm-up is single-flight', () => {
    expect(read('src/audio/ambient.js')).toMatch(/if \(warming\) return warming/);
  });
});

describe('animations are not switched off by a merely warm phone', () => {
  test('panels use useCalm: Reduce Motion or hot, never just warm', () => {
    expect(read('src/components/Panel.js')).toMatch(/useCalm\(\)/);
    const hook = read('src/hooks/useReducedMotion.js');
    expect(hook).toMatch(/export function useCalm/);
    expect(hook).toMatch(/system \|\| hot/);
  });
  test('the sweep plays again each time the screen comes into focus', () => {
    expect(read('src/components/Panel.js')).toMatch(/addListener\('focus'/);
  });
});

describe('the Schedule tab', () => {
  test('is the fourth inbox filter, and shows the scheduled-calls list', () => {
    expect(require('../src/api/hub').INBOX_FILTERS.map((f) => f.id)).toEqual(['primary', 'general', 'requests', 'schedule']);
    const chat = read('src/screens/hub/ChatHome.js');
    expect(chat).toMatch(/filter === 'schedule'/);
    expect(chat).toMatch(/<ScheduleList /);
  });

  describe('the list', () => {
    const when = Date.now() + 3 * 3600 * 1000;
    const rows = [{ room_id: 'room-1', host_id: 'me', participant_id: 'kofi', scheduled_time: new Date(when).toISOString(), status: 'pending' }];
    async function renderList(list) {
      mockUpcoming = list;
      mockOpen.mockClear();
      const ScheduleList = require('../src/components/hub/ScheduleList').default;
      await render(<ScheduleList userId="me" />);
      await act(async () => {});
      return mockOpen;
    }

    test('lists your upcoming calls with who they are with, and a tap opens the countdown', async () => {
      const open = await renderList(rows);
      expect(screen.getByText('Kofi Boateng')).toBeOnTheScreen();
      expect(screen.getByText(/You will start this call/)).toBeOnTheScreen();
      await userEvent.setup().press(screen.getByTestId('schedule-row-room-1'));
      expect(open).toHaveBeenCalledWith('room-1');
    });

    test('with nothing booked it says so', async () => {
      await renderList([]);
      expect(screen.getByTestId('schedule-empty')).toBeOnTheScreen();
    });
  });
});

describe('Talent initials and section titles', () => {
  test('the Chat talent card reserves room for its text under the initials', () => {
    const head = read('src/components/Headshot.js');
    expect(head).toMatch(/const clear = round \? 0 : caption \? plate \+ PLATE_GAP : Math\.max\(0, reserve\)/);
    expect(read('src/screens/hub/ChatHome.js')).toMatch(/reserve=\{TALENT_TEXT\}/);
  });
});

describe('tab bar motion', () => {
  const app = read('App.js');
  test('Originals has a soft radial orb, not a hard disc; every tab ripples and breathes', () => {
    expect(app).toMatch(/testID="tab-originals-orb"/);
    expect(app).toMatch(/<TabOrb /);
    expect(app).not.toMatch(/boxShadow: '0px 0px 14px rgba\(226,168,75,0\.85\)'/);
    expect(app).toMatch(/const breathe = useSharedValue/);
    expect(app).toMatch(/const ripple = useSharedValue/);
    expect(app).toMatch(/useCalm\(\)/);
  });
});

describe('alarm themes', () => {
  const kotlin = read('modules/boa-alarm/android/src/main/java/expo/modules/boaalarm/AlarmTheme.kt');
  test('six themes, with the same ids and names in the app and on the phone', () => {
    const { ALARM_THEMES } = require('../src/data/alarmThemes');
    expect(ALARM_THEMES).toHaveLength(6);
    const ids = [...kotlin.matchAll(/id = "([a-z]+)", name = "([A-Za-z]+)"/g)].map((m) => [m[1], m[2]]);
    expect(ids).toEqual(ALARM_THEMES.map((t) => [t.id, t.name]));
  });

  test('choosing one is kept and handed to the phone; unknown ids fall back to Gilded', () => {
    const BoaAlarm = require('../modules/boa-alarm');
    const store = require('../src/data/alarmThemes');
    store.setAlarmTheme('ember');
    expect(store.getAlarmTheme()).toBe('ember');
    expect(BoaAlarm.setTheme).toHaveBeenLastCalledWith('ember');
    store.setAlarmTheme('nonsense');
    expect(store.getAlarmTheme()).toBe('gilded');
  });

  test('the settings picker lists them, picks one and previews it', async () => {
    const BoaAlarm = require('../modules/boa-alarm');
    const store = require('../src/data/alarmThemes');
    const AlarmThemePicker = require('../src/components/alarms/AlarmThemePicker').default;
    await render(<AlarmThemePicker />);
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    const user = userEvent.setup();
    await user.press(screen.getByTestId('alarm-theme-aurora'));
    expect(store.getAlarmTheme()).toBe('aurora');
    await user.press(screen.getByTestId('alarm-theme-preview'));
    expect(BoaAlarm.preview).toHaveBeenLastCalledWith('aurora');
  });

  test('the native page reads the theme, supports a preview, and the module exposes both', () => {
    const activity = read('modules/boa-alarm/android/src/main/java/expo/modules/boaalarm/AlarmActivity.kt');
    expect(activity).toMatch(/AlarmStore\.theme\(this\)/);
    expect(activity).toMatch(/EXTRA_PREVIEW/);
    expect(activity).toMatch(/createBlurEffect/);
    const mod = read('modules/boa-alarm/android/src/main/java/expo/modules/boaalarm/BoaAlarmModule.kt');
    expect(mod).toMatch(/Function\("setTheme"\)/);
    expect(mod).toMatch(/Function\("preview"\)/);
  });
});

describe('the screensaver', () => {
  test('the two originals are the first options and the default, and the even veil replaces the bands', () => {
    const { SCREENSAVERS, DEFAULT_SCREENSAVER } = require('../src/data/screensavers');
    expect(SCREENSAVERS.slice(0, 2).map((s) => s.id)).toEqual(['night', 'rain']);
    expect(DEFAULT_SCREENSAVER).toBe('night');
    expect(read('src/components/zen/Screensavers.js')).not.toMatch(/<Vignette \/>/);
  });
});
