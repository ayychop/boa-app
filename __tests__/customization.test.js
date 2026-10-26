import fs from 'fs';
import path from 'path';
import { act, fireEvent, render, screen, userEvent } from '@testing-library/react-native';

jest.useFakeTimers();

let mockHub;
jest.mock('../src/context/HubContext', () => ({ useHub: () => mockHub }));

const { PALETTE, cleanTheme, textContrast, textOn, withChatTheme } = require('../src/chat/bubbleTheme');
const { VIBES } = require('../src/chat/vibes');
const { RINGTONES, ringtoneById } = require('../src/calls/ringtone');
const { haptics } = require('../src/utils/haptics');
const { createAudioPlayer } = require('expo-audio');
const ChatAppearanceScreen = require('../src/screens/hub/ChatAppearanceScreen').default;
const RingtoneScreen = require('../src/screens/hub/RingtoneScreen').default;

const { GestureHandlerRootView } = require('react-native-gesture-handler');
const navigation = { goBack: jest.fn(), navigate: jest.fn() };
// The app's root is a GestureHandlerRootView (App.js); so is the test's.
const Appearance = () => (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <ChatAppearanceScreen navigation={navigation} />
  </GestureHandlerRootView>
);

describe('Chat Appearance: bubble colours', () => {
  test('text stays readable (4.5:1 or better) for every colour, at every transparency, on every chat vibe', () => {
    for (const vibe of VIBES) {
      for (const { color } of PALETTE) {
        for (let t = 0; t <= 1.0001; t += 0.05) expect(textContrast(color, t, vibe.mesh[1])).toBeGreaterThanOrEqual(4.5);
      }
    }
    // Light colours get black text, dark ones white; glass over a dark chat gets white.
    expect(textOn('#FFFFFF', 0, '#07070A')).toBe('#000000');
    expect(textOn('#E2A84B', 0, '#07070A')).toBe('#000000');
    expect(textOn('#0E0E12', 0, '#07070A')).toBe('#FFFFFF');
    expect(textOn('#FFFFFF', 0.95, '#07070A')).toBe('#FFFFFF');
  });

  test('a curated palette of ten, and only well-formed themes are used', () => {
    expect(PALETTE).toHaveLength(10);
    expect(PALETTE.map((p) => p.label)).toEqual(expect.arrayContaining(['BOA Gold', 'Neon Blue', 'Emerald', 'Amethyst', 'Crimson', 'Sunset Orange', 'Pure White', 'Midnight Black']));
    expect(cleanTheme({ color: '#0f9d6e', transparency: 0.3 })).toEqual({ color: '#0F9D6E', transparency: 0.3 });
    expect(cleanTheme({ color: 'red', transparency: 0.3 })).toBeNull();
    expect(cleanTheme({ color: '#0F9D6E', transparency: 'lots' })).toBeNull();
    expect(cleanTheme({ color: '#0F9D6E', transparency: 7 })).toEqual({ color: '#0F9D6E', transparency: 1 });
  });

  test('your bubbles take your colour and transparency; no theme leaves the vibe alone', () => {
    const noir = VIBES[0];
    expect(withChatTheme(noir, null)).toBe(noir);
    const mine = withChatTheme(noir, { color: '#C8102E', transparency: 0.25 });
    expect(mine.mine[1]).toBe('rgba(200,16,46,0.75)');
    expect(mine.mineText).toBe('#FFFFFF');
    expect(mine.theirsFill).toBe(noir.theirsFill);
    expect(withChatTheme(noir, { color: '#FFFFFF', transparency: 0 }).mineText).toBe('#000000');
  });
});

describe('Chat Appearance screen', () => {
  beforeEach(() => {
    mockHub = { userId: 'user-me', chatTheme: null, setChatTheme: jest.fn(async () => {}) };
  });

  test('pick a colour, set the glass, save with a haptic; your choice reaches your profile', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const success = jest.spyOn(haptics, 'success');
    await render(<Appearance />);
    expect(screen.getByTestId('appearance-preview')).toBeOnTheScreen();
    expect(screen.getByLabelText('BOA Gold').props.accessibilityState.checked).toBe(true);
    await user.press(screen.getByTestId('appearance-color-emerald'));
    expect(screen.getByLabelText('Emerald').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('appearance-transparency-value')).toHaveTextContent('10%');
    await act(async () => fireEvent(screen.getByTestId('appearance-transparency'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } }));
    expect(screen.getByTestId('appearance-transparency-value')).toHaveTextContent('15%');
    await user.press(screen.getByTestId('appearance-save'));
    expect(mockHub.setChatTheme).toHaveBeenCalledWith({ color: '#0F9D6E', transparency: 0.15 });
    expect(success).toHaveBeenCalled();
    success.mockRestore();
  });

  test('starts from your saved theme, and can go back to the vibe\'s colours', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockHub.chatTheme = { color: '#9B5DE5', transparency: 0.4 };
    await render(<Appearance />);
    expect(screen.getByLabelText('Amethyst').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('appearance-transparency-value')).toHaveTextContent('40%');
    await user.press(screen.getByTestId('appearance-reset'));
    expect(mockHub.setChatTheme).toHaveBeenCalledWith(null);
  });
});

describe('Ringtone screen', () => {
  beforeEach(() => {
    mockHub = { userId: 'user-me', ringtone: 'hiphop', setRingtone: jest.fn(async () => {}) };
  });

  test('four original ringtones, each a real file in the app', () => {
    expect(RINGTONES.map((r) => r.id)).toEqual(['hiphop', 'rnb', 'afrobeats', 'bashment']);
    for (const r of RINGTONES) expect(fs.existsSync(path.join(__dirname, `../assets/sounds/ringtones/${r.id}.wav`))).toBe(true);
    expect(ringtoneById('nope').id).toBe('hiphop');
  });

  test('preview plays without choosing; tapping a row chooses it and the checkmark moves', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { rerender } = await render(<RingtoneScreen navigation={navigation} />);
    expect(screen.getByTestId('ringtone-hiphop-selected')).toBeOnTheScreen();

    createAudioPlayer.mockClear();
    await user.press(screen.getByTestId('ringtone-play-afrobeats'));
    expect(createAudioPlayer).toHaveBeenCalledWith(ringtoneById('afrobeats').asset);
    const preview = createAudioPlayer.mock.results.at(-1).value;
    await act(async () => {});
    expect(preview.play).toHaveBeenCalled();
    expect(preview.loop).toBe(false);
    expect(mockHub.setRingtone).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Stop Afrobeats')).toBeOnTheScreen();
    // It finishing (or another preview starting) lets go of the player.
    await act(async () => preview.emit('playbackStatusUpdate', { didJustFinish: true }));
    expect(preview.removed).toBe(true);
    expect(screen.getByLabelText('Play Afrobeats')).toBeOnTheScreen();

    await user.press(screen.getByTestId('ringtone-rnb'));
    expect(mockHub.setRingtone).toHaveBeenCalledWith('rnb');
    mockHub = { ...mockHub, ringtone: 'rnb' };
    await rerender(<RingtoneScreen navigation={navigation} />);
    expect(screen.getByTestId('ringtone-rnb-selected')).toBeOnTheScreen();
    expect(screen.queryByTestId('ringtone-hiphop-selected')).toBeNull();
  });
});

describe('the migration', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261027150000_chat_theme_and_ringtone.sql'), 'utf8');
  test('adds chat_theme (jsonb, shape-checked) and ringtone_preference (default hiphop, known ids only)', () => {
    expect(sql).toMatch(/add column if not exists chat_theme jsonb/);
    expect(sql).toMatch(/add column if not exists ringtone_preference text not null default 'hiphop'/);
    expect(sql).toMatch(/ringtone_preference in \('hiphop', 'rnb', 'afrobeats', 'bashment'\)/);
  });
});
