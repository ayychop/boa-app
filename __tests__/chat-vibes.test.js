import { act, render, screen, userEvent } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as hub from '../src/api/hub';
import HubThreadScreen from '../src/screens/hub/NewChatScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet, View } from 'react-native';
import { resetChatVibe, VIBES } from '../src/chat/vibes';
import VibePicker from '../src/components/chat/VibePicker';
import ChatVibeSheet from '../src/components/chat/ChatVibeSheet';
import useChatVibe from '../src/chat/vibes';

jest.useFakeTimers();

// A Realtime client with working broadcast rooms: the test plays the other
// person by calling a room's broadcast listeners, and sees what we send.
jest.mock('../src/lib/supabase', () => {
  const channels = [];
  const supabase = {
    channels,
    sent: [],
    channel(name, opts) {
      const found = channels.find((c) => c.name === name);
      if (found) return found;
      const c = {
        name,
        opts,
        listeners: [],
        on(type, filter, cb) {
          c.listeners.push({ type, filter, cb });
          return c;
        },
        subscribe(cb) {
          cb?.('SUBSCRIBED');
          return c;
        },
        send(msg) {
          supabase.sent.push({ room: name, ...msg });
          return Promise.resolve('ok');
        },
      };
      channels.push(c);
      return c;
    },
    removeChannel(c) {
      const i = channels.indexOf(c);
      if (i >= 0) channels.splice(i, 1);
    },
  };
  return { supabase, isConfigured: true, projectHost: 'test' };
});

// Every glass layer drawn, with the props it was given.
jest.mock('expo-blur', () => {
  const actual = jest.requireActual('expo-blur');
  const { View } = require('react-native');
  const BlurView = jest.fn((props) => <View testID="glass" style={props.style} />);
  return { ...actual, BlurView };
});
const { BlurView } = jest.requireMock('expo-blur');

let mockOnline = false;
jest.mock('../src/context/HubContext', () => ({
  useHub: () => ({ userId: 'user-me', isOnline: () => mockOnline, blocked: new Set(), unblock: jest.fn(() => Promise.resolve()) }),
}));

jest.mock('../src/api/hub', () => ({
  ...jest.requireActual('../src/api/hub'),
  getConversation: jest.fn(),
  listMessages: jest.fn(),
  sendMessage: jest.fn(),
  markRead: jest.fn(() => Promise.resolve()),
}));

const { supabase } = jest.requireMock('../src/lib/supabase');

const ME = 'user-me';
const AMA = { id: 'user-ama', username: 'ama', display_name: 'Ama Mensah', avatar_url: null, last_seen_at: null };
const conv = (other = AMA) => ({ id: 'conv-1', user_a: AMA.id, user_b: ME, otherId: AMA.id, other });
const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
const flush = () => act(async () => {});

const typingRoom = () => supabase.channels.find((c) => c.name === 'hub:typing:conv-1');
const theyType = (typing) =>
  act(async () => {
    typingRoom()
      .listeners.filter((l) => l.type === 'broadcast')
      .forEach((l) => l.cb({ payload: { userId: AMA.id, typing } }));
  });

async function open(other) {
  hub.getConversation.mockResolvedValue(conv(other));
  await render(
    <NavigationContainer>
      <HubThreadScreen navigation={navigation} route={{ params: { id: 'conv-1' } }} />
    </NavigationContainer>,
  );
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOnline = false;
  supabase.channels.length = 0;
  supabase.sent.length = 0;
  hub.listMessages.mockResolvedValue([{ id: 'm1', conversation_id: 'conv-1', sender_id: AMA.id, body: 'Hey there', created_at: new Date().toISOString() }]);
});

beforeEach(async () => {
  await AsyncStorage.clear();
  resetChatVibe();
});

// The palette in the thread header changes the vibe mid-chat (your profile has it too).
test('a new member starts on Turntable (a Premium vibe, for the trial); without Premium it shows as Noir', () => {
  const { WELCOME_VIBE, allowedVibe, vibeById, isPremiumVibe } = require('../src/chat/vibes');
  expect(WELCOME_VIBE).toBe('turntable');
  expect(isPremiumVibe(WELCOME_VIBE)).toBe(true);
  expect(allowedVibe(vibeById(WELCOME_VIBE), false).id).toBe('noir');
});

test("the thread header's palette opens the vibe sheet, and a pick shows at once", async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await open(AMA);
  expect(screen.queryByTestId('chat-vibe-sheet')).toBeNull();
  expect(screen.getByTestId('chat-mesh-turntable')).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Chat vibe' }));
  expect(screen.getByTestId('chat-vibe-sheet')).toBeOnTheScreen();
  await user.press(screen.getByTestId('chat-vibe-neon'));
  expect(screen.getByTestId('chat-mesh-neon')).toBeOnTheScreen();
});

test('a pick in the vibe sheet turns an open thread blue and violet at once, and is saved', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  hub.getConversation.mockResolvedValue(conv(AMA));
  await render(
    <NavigationContainer>
      <HubThreadScreen navigation={navigation} route={{ params: { id: 'conv-1' } }} />
      <ChatVibeSheet open onClose={() => {}} />
    </NavigationContainer>,
  );
  await flush();
  expect(screen.getByTestId('chat-mesh-turntable')).toBeOnTheScreen();
  expect(screen.getByTestId('chat-vibe-sheet')).toBeOnTheScreen();
  await user.press(screen.getByTestId('chat-vibe-neon'));
  await flush();
  // Neon is drawn at once, at full strength, under the fading Turntable: it never
  // waits on an animation to appear (a stalled fade left Android flat black).
  const current = screen.getByTestId('chat-backdrop-neon');
  expect(current).toContainElement(screen.getByTestId('chat-mesh-neon'));
  expect(StyleSheet.flatten(current.props.style).opacity).toBeUndefined();
  expect(screen.getByTestId('chat-backdrop-leaving')).toContainElement(screen.getByTestId('chat-mesh-turntable'));
  // Even with the animation frozen, a plain timer takes the old vibe away.
  await act(async () => jest.advanceTimersByTime(600));
  expect(screen.queryByTestId('chat-backdrop-leaving')).toBeNull();
  expect(screen.queryByTestId('chat-mesh-turntable')).toBeNull();
  expect(screen.getByTestId('chat-mesh-neon')).toBeOnTheScreen();
  expect(screen.getByTestId('chat-vibe-neon-selected')).toBeOnTheScreen();
  expect(await AsyncStorage.getItem('boa:chat-vibe:v1')).toBe('neon');
});

test('a saved vibe comes back: Midnight Drive opens on navy with its starfield', async () => {
  await AsyncStorage.setItem('boa:chat-vibe:v1', 'midnight');
  await open(AMA);
  expect(screen.getByTestId('chat-mesh-midnight')).toBeOnTheScreen();
  expect(screen.getByTestId('chat-particles-stars')).toBeOnTheScreen();
});

test('a pick in one place shows everywhere (Settings and an open thread share it)', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  function Probe() {
    const { vibe } = useChatVibe();
    return <View testID={`probe-${vibe.id}`} />;
  }
  function SettingsPicker() {
    const { vibe, setVibe } = useChatVibe();
    return <VibePicker value={vibe.id} onChange={setVibe} />;
  }
  await render(
    <>
      <SettingsPicker />
      <Probe />
    </>,
  );
  await flush();
  expect(screen.getByTestId('probe-turntable')).toBeOnTheScreen();
  await user.press(screen.getByTestId('chat-vibe-midnight'));
  expect(screen.getByTestId('probe-midnight')).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: /Midnight/ })).toBeSelected();
});

// The three layers. On Android a blur-target view painted opaque over the
// backdrop and left every vibe flat black; there must be none, and nothing
// between the backdrop and the bubbles may paint a fill.
test('three layers: the backdrop at the back, the messages over it, the header and composer on top', async () => {
  await open(AMA);
  const thread = screen.getByTestId('hub-thread');
  const backdrop = screen.getByTestId('chat-backdrop');
  const messages = screen.getByTestId('chat-layer-messages');
  // Layer 1: a full-screen, untouchable layer at zIndex 0, a direct child of the screen (outside the keyboard's reach).
  const b = StyleSheet.flatten(backdrop.props.style);
  expect(b).toMatchObject({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 });
  expect(backdrop.props.pointerEvents).toBe('none');
  expect(thread.children).toContain(backdrop);
  expect(screen.getByTestId('hub-thread-keyboard')).not.toContainElement(backdrop);
  // Layer 2: transparent, above the backdrop, holding the bubbles and nothing else.
  const m = StyleSheet.flatten(messages.props.style);
  expect(m.zIndex).toBe(1);
  expect(m.backgroundColor).toBe('transparent');
  expect(messages).toContainElement(screen.getByTestId('hub-message-m1'));
  expect(messages).not.toContainElement(screen.getByTestId('thread-header'));
  expect(messages).not.toContainElement(screen.getByTestId('hub-composer-bar'));
  // Layer 3: the bars, above the list.
  expect(StyleSheet.flatten(screen.getByTestId('thread-header').props.style).zIndex).toBe(2);
  // No Android blur target anywhere: the glass is a tint there.
  for (const [props] of BlurView.mock.calls) expect(props.blurTarget).toBeUndefined();
});

test('bubbles are translucent glass: the backdrop shows through, the text stays solid', async () => {
  hub.listMessages.mockResolvedValue([
    { id: 'm1', conversation_id: 'conv-1', sender_id: AMA.id, body: 'Hey there', created_at: new Date().toISOString() },
    { id: 'm2', conversation_id: 'conv-1', sender_id: ME, body: 'Hi Ama', created_at: new Date().toISOString() },
  ]);
  await open(AMA);
  // Strings as written, or the native gradient's ARGB integers.
  const alphaOf = (c) => (typeof c === 'number' ? (c >>> 24) / 255 : Number(String(c).match(/rgba\([^)]*,\s*([\d.]+)\)/)?.[1] ?? 1));
  expect(alphaOf(StyleSheet.flatten(screen.getByTestId('hub-message-m1').props.style).backgroundColor)).toBeLessThanOrEqual(0.74);
  const mine = screen.getByTestId('hub-message-m2');
  const fill = mine.children.find((c) => c.props?.colors);
  for (const c of fill.props.colors) expect(alphaOf(c)).toBeLessThanOrEqual(0.9 + 1 / 255);
  expect(StyleSheet.flatten(screen.getByText('Hi Ama').props.style).color).toBe(VIBES.find((v) => v.id === 'turntable').mineText);
});

test('Motion or Static: the sheet switches it, it is saved, and Static holds the backdrop still', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  const reanimated = require('react-native-reanimated');
  await AsyncStorage.setItem('boa:chat-vibe:v1', 'turntable');
  await open(AMA);
  expect(screen.getByTestId('chat-turntable')).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Chat vibe' }));
  expect(screen.getByTestId('vibe-mode-motion').props.accessibilityState.selected).toBe(true);
  await user.press(screen.getByTestId('vibe-mode-static'));
  await flush();
  expect(screen.getByTestId('vibe-mode-static').props.accessibilityState.selected).toBe(true);
  expect(await AsyncStorage.getItem('boa:chat-motion:v1')).toBe('static');
  // Held still: remounting the thread in Static starts no endless loops in the backdrop.
  await screen.unmount();
  const repeat = jest.spyOn(reanimated, 'withRepeat');
  await open(AMA);
  expect(screen.getByTestId('chat-turntable')).toBeOnTheScreen();
  const backdropLoops = repeat.mock.calls.length;
  repeat.mockRestore();
  // The composer's glow ring breathes and the loading shimmer sweeps while
  // the thread opens; the backdrop adds nothing.
  expect(backdropLoops).toBeLessThanOrEqual(2);
});

// The audit: nothing in the thread paints a solid black (or near-black) fill
// over the backdrop, in any vibe.
const BLACK = /^(black|#000(000)?|#050506|#0b0b0d|rgba?\(0,\s*0,\s*0(,\s*1)?\))$/i;
test.each(VIBES.map((v) => v.id))('no solid black fill anywhere in the %s thread', async (id) => {
  await AsyncStorage.setItem('boa:chat-vibe:v1', id);
  await open(AMA);
  const fills = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const bg = StyleSheet.flatten(node.props?.style)?.backgroundColor;
    if (typeof bg === 'string') fills.push(bg);
    (node.children ?? []).forEach(walk);
  };
  walk(screen.toJSON());
  expect(fills.length).toBeGreaterThan(5);
  expect(fills.filter((c) => BLACK.test(c.trim()))).toEqual([]);
  // The screen's own fill is the vibe's mesh tone, not black.
  expect(StyleSheet.flatten(screen.getByTestId('hub-thread').props.style).backgroundColor).toBe(VIBES.find((v) => v.id === id).mesh[1]);
});

test("bubbles: frosted glass with a visible edge, no drop shadow (bar Neon's glow), times in spaced capitals", async () => {
  hub.listMessages.mockResolvedValue([
    { id: 'm1', conversation_id: 'conv-1', sender_id: AMA.id, body: 'Hey there', created_at: new Date().toISOString() },
    { id: 'm2', conversation_id: 'conv-1', sender_id: ME, body: 'Hi Ama', created_at: new Date().toISOString() },
  ]);
  await open(AMA);
  for (const id of ['m1', 'm2']) {
    const style = StyleSheet.flatten(screen.getByTestId(`hub-message-${id}`).props.style);
    expect(style.borderWidth).toBeGreaterThanOrEqual(1);
    expect(style.boxShadow).toBeFalsy();
  }
  const theirs = StyleSheet.flatten(screen.getByTestId('hub-message-m1').props.style);
  expect(theirs.backgroundColor).toMatch(/^rgba\(/);
  const meta = StyleSheet.flatten(screen.getAllByText(/:/)[0].props.style);
  expect(meta.textTransform).toBe('uppercase');
  expect(meta.fontFamily).toBe('SpaceGrotesk_500Medium');
  expect(StyleSheet.flatten(screen.getByText('Hey there').props.style).fontFamily).toBe('PlusJakartaSans_500Medium');
});

// React Native 0.88 dropped StyleSheet.absoluteFillObject: spreading it adds
// nothing, and the old backdrop was a zero-height box clipping its whole scene.
test('the chat never spreads StyleSheet.absoluteFillObject (gone in React Native 0.88)', () => {
  const { StyleSheet: SS } = require('react-native');
  expect(SS.absoluteFillObject).toBeUndefined();
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '../src/components/chat');
  const files = [...fs.readdirSync(dir).map((f) => path.join(dir, f)), path.join(__dirname, '../src/screens/hub/NewChatScreen.js')];
  for (const f of files) expect([f, /absoluteFillObject/.test(fs.readFileSync(f, 'utf8'))]).toEqual([f, false]);
});

// Android draws every <Svg> into a bitmap its full size: the screen-and-a-half
// lights were some 35 MB each, and never showed on the Fold. The glows are
// small gradients scaled up by transform.
test('the drifting glows are small SVG gradients scaled up, never screen-sized bitmaps', async () => {
  const ChatBackdrop = require('../src/components/chat/ChatBackdrop').default;
  await render(<ChatBackdrop vibe={VIBES[0]} />);
  const glow = screen.getByTestId('chat-glow-a');
  const svg = glow.children[0];
  expect(svg.props.width ?? StyleSheet.flatten(svg.props.style)?.width).toBeLessThanOrEqual(96);
});
