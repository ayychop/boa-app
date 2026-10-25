import { useState } from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import TimeWheel from '../src/components/alarms/TimeWheel';
import { formatTime, nextRing, timeParts, to12h, to24h } from '../src/data/alarms';

const ROW = 52;

// The wheel as the editor uses it: it owns the 24-hour time.
function Harness({ start = [13, 5] }) {
  const [[hour, minute], setTime] = useState(start);
  return (
    <>
      <TimeWheel hour={hour} minute={minute} onChange={(h, m) => setTime([h, m])} />
      <Text testID="stored">{`${hour}:${minute}`}</Text>
      <Text testID="shown">{formatTime(hour, minute)}</Text>
    </>
  );
}

const stored = () => screen.getByTestId('stored').props.children;
const shown = () => screen.getByTestId('shown').props.children;
const spin = (testID, index) => fireEvent(screen.getByTestId(`${testID}-scroll`), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 0, y: index * ROW } } });

describe('12-hour time', () => {
  test('every hour of the day survives the round trip through AM / PM', () => {
    for (let h = 0; h < 24; h++) {
      const { hour12, pm } = to12h(h);
      expect(hour12).toBeGreaterThanOrEqual(1);
      expect(hour12).toBeLessThanOrEqual(12);
      expect(to24h(hour12, pm)).toBe(h);
    }
  });

  test('reads like a clock: midnight is 12 AM, noon is 12 PM', () => {
    expect(formatTime(13, 5)).toBe('1:05 PM');
    expect(formatTime(0, 0)).toBe('12:00 AM');
    expect(formatTime(12, 30)).toBe('12:30 PM');
    expect(formatTime(7, 0)).toBe('7:00 AM');
    expect(timeParts(23, 59)).toEqual({ time: '11:59', period: 'PM' });
  });
});

describe('the time wheel', () => {
  test('its drums scroll inside the editor on Android (nested scrolling)', async () => {
    await render(<Harness />);
    expect(screen.getByTestId('alarm-hour-scroll').props.nestedScrollEnabled).toBe(true);
    expect(screen.getByTestId('alarm-minute-scroll').props.nestedScrollEnabled).toBe(true);
  });

  test('turning the drums changes the time', async () => {
    await render(<Harness />);
    expect(shown()).toBe('1:05 PM');
    // Hours run 1 to 12: index 6 is 7.
    await act(async () => spin('alarm-hour', 6));
    expect(shown()).toBe('7:05 PM');
    expect(stored()).toBe('19:5');
    await act(async () => spin('alarm-minute', 45));
    expect(shown()).toBe('7:45 PM');
    expect(stored()).toBe('19:45');
  });

  test('AM / PM switches between morning and evening, keeping the clock time', async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    expect(screen.getByTestId('alarm-pm').props.accessibilityState).toEqual({ checked: true });
    await user.press(screen.getByTestId('alarm-am'));
    expect(shown()).toBe('1:05 AM');
    expect(stored()).toBe('1:5');
    await user.press(screen.getByTestId('alarm-pm'));
    expect(stored()).toBe('13:5');
  });

  test('12 on the drum is midnight in the morning and noon in the afternoon', async () => {
    const user = userEvent.setup();
    await render(<Harness start={[9, 0]} />);
    await act(async () => spin('alarm-hour', 11));
    expect(stored()).toBe('0:0');
    expect(shown()).toBe('12:00 AM');
    await user.press(screen.getByTestId('alarm-pm'));
    expect(stored()).toBe('12:0');
  });

  test('a PM alarm is scheduled in the afternoon', () => {
    const from = new Date(2026, 9, 25, 9, 0);
    const ring = nextRing({ enabled: true, hour: to24h(1, true), minute: 5, days: [] }, from);
    expect(ring.getHours()).toBe(13);
    expect(ring.getMinutes()).toBe(5);
    expect(ring.getDate()).toBe(25);
    const early = nextRing({ enabled: true, hour: to24h(6, false), minute: 30, days: [] }, from);
    expect(early.getHours()).toBe(6);
    expect(early.getDate()).toBe(26);
  });
});

jest.mock('../src/context/AlarmContext', () => ({
  useAlarms: () => ({ alarms: [], save: jest.fn(), toggle: jest.fn(), remove: jest.fn(), permission: 'granted', askPermission: jest.fn() }),
  newAlarm: () => ({ id: 'alarm-new', name: 'Wake up', hour: 13, minute: 5, days: [], enabled: true, sound: { type: 'tone', id: 'bowl' } }),
}));
jest.mock('../src/context/UserContext', () => ({ useUser: () => ({ saved: [] }) }));

describe('Alarm Settings', () => {
  const AlarmSettingsScreen = require('../src/screens/AlarmSettingsScreen').default;
  const { NavigationContainer } = require('@react-navigation/native');

  test('a new alarm shows 12-hour time, and "Wake up to" lights the chosen card', async () => {
    const user = userEvent.setup();
    await render(
      <NavigationContainer>
        <AlarmSettingsScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} />
      </NavigationContainer>,
    );
    await user.press(screen.getByTestId('alarm-new'));
    expect(screen.getByTestId('alarm-pm').props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByTestId('alarm-wake-tone').props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByTestId('alarm-wake-station').props.accessibilityState).toEqual({ checked: false });
    expect(screen.getByTestId('alarm-sound-bowl')).toBeOnTheScreen();
    await user.press(screen.getByTestId('alarm-wake-station'));
    expect(screen.getByTestId('alarm-wake-station').props.accessibilityState).toEqual({ checked: true });
    expect(screen.queryByTestId('alarm-sound-bowl')).toBeNull();
    expect(screen.getByText(/The station tunes in/)).toBeOnTheScreen();
  });
});
