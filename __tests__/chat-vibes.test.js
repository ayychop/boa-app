import { act, render, screen, userEvent } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as hub from '../src/api/hub';
import HubThreadScreen from '../src/screens/hub/HubThreadScreen';
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
test("the thread header's palette opens the vibe sheet, and a pick shows at once", async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await open(AMA);
  expect(screen.queryByTestId('chat-vibe-sheet')).toBeNull();
  expect(screen.getByTestId('chat-mesh-noir')).toBeOnTheScreen();
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
  expect(screen.getByTestId('chat-mesh-noir')).toBeOnTheScreen();
  expect(screen.getByTestId('chat-vibe-sheet')).toBeOnTheScreen();
  await user.press(screen.getByTestId('chat-vibe-neon'));
  await flush();
  // Neon is drawn at once, at full strength, under the fading Noir: it never
  // waits on an animation to appear (a stalled fade left Android flat black).
  const current = screen.getByTestId('chat-ambient-current');
  expect(current).toContainElement(screen.getByTestId('chat-mesh-neon'));
  expect(StyleSheet.flatten(current.props.style).opacity).toBeUndefined();
  expect(screen.getByTestId('chat-ambient-leaving')).toContainElement(screen.getByTestId('chat-mesh-noir'));
  // Even with the animation frozen, a plain timer takes Noir away.
  await act(async () => jest.advanceTimersByTime(600));
  expect(screen.queryByTestId('chat-ambient-leaving')).toBeNull();
  expect(screen.queryByTestId('chat-mesh-noir')).toBeNull();
  expect(screen.getByTestId('chat-mesh-neon')).toBeOnTheScreen();
  expect(screen.getByTestId('chat-vibe-neon-selected')).toBeOnTheScreen();
  expect(await AsyncStorage.getItem('boa:chat-vibe:v1')).toBe('neon');
});

test('a saved vibe comes back: Midnight opens on charcoal with its deeper sky', async () => {
  await AsyncStorage.setItem('boa:chat-vibe:v1', 'midnight');
  await open(AMA);
  expect(screen.getByTestId('chat-mesh-midnight')).toBeOnTheScreen();
  expect(screen.getByTestId('chat-stars-3')).toBeOnTheScreen();
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
  expect(screen.getByTestId('probe-noir')).toBeOnTheScreen();
  await user.press(screen.getByTestId('chat-vibe-midnight'));
  expect(screen.getByTestId('probe-midnight')).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: /Midnight/ })).toBeSelected();
});

// On Android a BlurView without a blurTarget silently draws no blur at all.
test('the header and composer glass both blur the backdrop and the messages behind them', async () => {
  await open(AMA);
  const behind = screen.getByTestId('hub-thread-behind');
  expect(screen.getAllByTestId('glass').length).toBeGreaterThanOrEqual(2);
  for (const [props] of BlurView.mock.calls) {
    expect(props.blurTarget?.current).toBeTruthy();
    expect(props.blurMethod).toBe('dimezisBlurView');
  }
  expect(behind).toContainElement(screen.getByTestId('chat-ambient'));
  expect(behind).toContainElement(screen.getByTestId('hub-message-m1'));
  expect(behind).not.toContainElement(screen.getByTestId('thread-header'));
  expect(behind).not.toContainElement(screen.getByTestId('hub-composer-bar'));
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

test('bubbles: frosted glass with a visible edge, no drop shadow (bar Neon\'s glow), times in spaced capitals', async () => {
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
