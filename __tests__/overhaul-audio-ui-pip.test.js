import fs from 'fs';
import path from 'path';
import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// BOA Hi-Fi: the native effects are mocked so we can watch what the sliders
// ask the hardware to do, and whether a move is saved.
jest.mock('../modules/boa-eq', () => ({ isAvailable: true, apply: jest.fn(() => true), release: jest.fn() }));
const eqNative = require('../modules/boa-eq');
const eq = require('../src/audio/eq');

describe('BOA Hi-Fi: the slider is live and saves on release', () => {
  test('preview shapes the sound at once without saving; setSettings saves', async () => {
    eq.setAllowed(true);
    eq.setSession(42);
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    setItem.mockClear();
    eqNative.apply.mockClear();
    // A move while the finger is down: the hardware hears it immediately, but
    // nothing is written to storage yet.
    eq.preview({ bass: 0.5 });
    expect(eqNative.apply).toHaveBeenLastCalledWith(42, expect.objectContaining({ bass: 0.5 }));
    expect(eq.getSettings().bass).toBe(0.5);
    expect(setItem).not.toHaveBeenCalledWith('boa.eq.v2', expect.anything());
    // Letting go saves it.
    eq.setSettings({ bass: 0.6 });
    expect(setItem).toHaveBeenCalledWith('boa.eq.v2', expect.stringContaining('0.6'));
    eq.setSettings(eq.SIGNATURE);
  });

  test('the equaliser sheet drives the hardware through preview, and persists on release', () => {
    const src = read('src/components/radio/EqualizerSheet.js');
    expect(src).toMatch(/onPreview=\{\(v\) => eq\.preview\(\{ bass: v \}\)\}/);
    expect(src).toMatch(/onCommit=\{\(v\) => eq\.setSettings\(\{ bass: v \}\)\}/);
    // The slider runs on its own value while dragging, so it never fights the store.
    expect(src).toMatch(/const \[shown, setShown\] = useState\(value\)/);
    expect(src).toMatch(/if \(!dragging\.current\) setShown\(value\)/);
  });
});

describe('Chat Vibe and Profile Vibe are independent', () => {
  const { resetChatVibe, resetProfileVibe, setChatVibe, setProfileVibe } = require('../src/chat/vibes');
  const useChatVibe = require('../src/chat/vibes').default;
  const { useProfileVibe } = require('../src/chat/vibes');

  function Probe() {
    const chat = useChatVibe();
    const prof = useProfileVibe();
    return (
      <>
        <Text testID="chat-vibe">{chat.vibe.id}</Text>
        <Text testID="profile-vibe-id">{prof.vibe.id}</Text>
      </>
    );
  }

  beforeEach(() => {
    resetChatVibe();
    resetProfileVibe();
  });

  test('changing one never changes the other', async () => {
    await act(async () => {
      render(<Probe />);
    });
    // The profile starts on Noir, the brand look, whatever the chat is on.
    expect(screen.getByTestId('profile-vibe-id')).toHaveTextContent('noir');
    const chatStart = screen.getByTestId('chat-vibe').props.children;

    await act(async () => setProfileVibe('neon'));
    expect(screen.getByTestId('profile-vibe-id')).toHaveTextContent('neon');
    // The chat vibe did not move.
    expect(screen.getByTestId('chat-vibe')).toHaveTextContent(String(chatStart));

    await act(async () => setChatVibe('minimalist'));
    expect(screen.getByTestId('chat-vibe')).toHaveTextContent('minimalist');
    // The profile vibe did not move.
    expect(screen.getByTestId('profile-vibe-id')).toHaveTextContent('neon');
  });

  test('they are kept under separate storage keys', () => {
    const src = read('src/chat/vibes.js');
    expect(src).toMatch(/const KEY = 'boa:chat-vibe:v1'/);
    expect(src).toMatch(/const PROFILE_KEY = 'boa:profile-vibe:v1'/);
  });
});

describe('the BOA brand stays locked to gold', () => {
  test('the profile header wordmark is always BOA gold, never the vibe colour', () => {
    const src = read('src/screens/hub/HubProfileScreen.js');
    const mark = src.match(/<LogoWatermark[\s\S]*?\/>/)[0];
    expect(mark).toMatch(/color=\{colors\.gold\}/);
    expect(mark).not.toMatch(/color=\{vibe\./);
  });

  test('the profile is themed by the Profile Vibe, not the Chat Vibe', () => {
    const src = read('src/screens/hub/HubProfileScreen.js');
    expect(src).toMatch(/useProfileVibe/);
    expect(src).not.toMatch(/useChatVibe/);
  });
});

describe('an Inbox shortcut lives on the profile', () => {
  test('a Messages button goes to the Hub inbox', () => {
    const src = read('src/screens/hub/HubProfileScreen.js');
    expect(src).toMatch(/testID="profile-inbox"/);
    expect(src).toMatch(/navigation\.navigate\('HubChats'\)/);
  });
});

describe('the font picker sits in the vibe section and reaches the chat', () => {
  test('the Typeface picker is in Hub settings, under the vibes', () => {
    const src = read('src/screens/hub/HubSettingsScreen.js');
    const vibeAt = src.indexOf('Chat vibe');
    const fontAt = src.indexOf('Typeface');
    const presenceAt = src.indexOf('Presence');
    expect(vibeAt).toBeGreaterThan(-1);
    // The typeface now comes after the vibes, no longer up with the general settings.
    expect(fontAt).toBeGreaterThan(vibeAt);
    expect(fontAt).toBeGreaterThan(presenceAt);
  });

  test('the chat thread header wears the chosen headline typeface', () => {
    const src = read('src/screens/hub/NewChatScreen.js');
    expect(src).toMatch(/const headlineFont = useHeadlineFont\(\)/);
    expect(src).toMatch(/fontFamily: headlineFont/);
  });
});

describe('BOA Originals polish', () => {
  test('the headline is not clipped by an overflow-hidden wrapper', () => {
    const src = read('src/screens/OriginalsScreen.js');
    const block = src.slice(src.indexOf('All productions') - 200, src.indexOf('All productions') + 200);
    expect(block).not.toMatch(/overflow: 'hidden'/);
  });

  test('Episode 1 carries a gold BOA play badge', () => {
    const src = read('src/screens/OriginalsScreen.js');
    expect(src).toMatch(/playBadge/);
    expect(src).toMatch(/name="play"/);
  });

  test('Coming Soon cards centre their text rather than pushing it to the floor', () => {
    const src = read('src/components/Poster.js');
    expect(src).toMatch(/contentSoon: \{ justifyContent: 'center' \}/);
    expect(src).toMatch(/soon && styles\.contentSoon/);
  });

  test('the BOA Originals tab has a gold gleam that honours Reduce Motion', () => {
    const src = read('App.js');
    expect(src).toMatch(/const premium = name === 'Originals'/);
    expect(src).toMatch(/tabGleam/);
    expect(src).toMatch(/if \(!premium \|\| reduceMotion\) return/);
  });
});
