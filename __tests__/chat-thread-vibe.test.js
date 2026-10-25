import { act, render, screen, userEvent } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as hub from '../src/api/hub';
import HubThreadScreen from '../src/screens/hub/HubThreadScreen';
import AmbientGlow, { STARS } from '../src/components/chat/AmbientGlow';
import { TYPING_EVERY_MS, TYPING_HOLD_MS } from '../src/chat/typing';

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

test("a BOA Star's glowing badge sits beside their name; others have none", async () => {
  await open({ ...AMA, is_boa_star: true });
  expect(screen.getByTestId('boa-star')).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'Ama Mensah' })).toBeOnTheScreen();
  await screen.unmount();
  await open(AMA);
  expect(screen.queryByTestId('boa-star')).toBeNull();
});

test('the header status line: what they play, else Online in the Hub, else when they were last about', async () => {
  await open({ ...AMA, status_kind: 'listening', status_text: 'Afrobeats FM', status_updated_at: new Date().toISOString() });
  expect(screen.getByTestId('now-playing')).toHaveTextContent(/Listening to Afrobeats FM$/);
  await screen.unmount();

  mockOnline = true;
  await open(AMA);
  expect(screen.getByTestId('thread-status-online')).toHaveTextContent('Online in the Hub');
  await screen.unmount();

  mockOnline = false;
  await open({ ...AMA, last_seen_at: new Date(Date.now() - 3 * 3600000).toISOString() });
  expect(screen.getByTestId('thread-status-seen')).toHaveTextContent('Active 3 hr ago');
});

test('when they type, gold dots appear in the thread and the header says typing; they go when they stop', async () => {
  await open(AMA);
  expect(screen.queryByTestId('typing-indicator')).toBeNull();
  await theyType(true);
  expect(screen.getByTestId('typing-indicator')).toBeOnTheScreen();
  expect(screen.getByTestId('thread-status-typing')).toHaveTextContent('typing');
  await theyType(false);
  expect(screen.queryByTestId('typing-indicator')).toBeNull();
  // A typing ping that's never followed up fades on its own.
  await theyType(true);
  await act(async () => jest.advanceTimersByTime(TYPING_HOLD_MS + 50));
  expect(screen.queryByTestId('typing-indicator')).toBeNull();
});

test('their message arriving clears the typing dots', async () => {
  await open(AMA);
  await theyType(true);
  const thread = supabase.channels.find((c) => c.name.startsWith('hub:thread:conv-1'));
  await act(async () => {
    thread.listeners
      .find((l) => l.type === 'postgres_changes' && l.filter.event === 'INSERT')
      .cb({ new: { id: 'm2', conversation_id: 'conv-1', sender_id: AMA.id, body: 'Done!', created_at: new Date().toISOString() } });
  });
  expect(screen.queryByTestId('typing-indicator')).toBeNull();
  // A new arrival makes an entrance; what was there on opening doesn't.
  expect(screen.getByTestId('hub-message-fresh-m2')).toBeOnTheScreen();
  expect(screen.queryByTestId('hub-message-fresh-m1')).toBeNull();
});

test('your typing goes out at most every few seconds, and stops when you send', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  hub.sendMessage.mockImplementation(async (_c, body) => ({ id: 'm9', conversation_id: 'conv-1', sender_id: ME, body, created_at: new Date().toISOString() }));
  await open(AMA);
  await user.type(screen.getByTestId('hub-composer'), 'Hello');
  const pings = () => supabase.sent.filter((m) => m.payload.typing === true);
  expect(pings()).toHaveLength(1);
  expect(pings()[0]).toMatchObject({ room: 'hub:typing:conv-1', event: 'typing', payload: { userId: ME } });
  await act(async () => jest.advanceTimersByTime(TYPING_EVERY_MS));
  await user.type(screen.getByTestId('hub-composer'), '!');
  expect(pings()).toHaveLength(2);
  // Send: a glowing gold button; it says you've stopped.
  expect(screen.getByTestId('hub-send-glow')).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Send' }));
  await flush();
  expect(supabase.sent.at(-1).payload.typing).toBe(false);
  expect(screen.getByTestId('hub-mic-glow')).toBeOnTheScreen();
  // Your sent message rose in when it was sent, not again once saved.
  expect(screen.queryByTestId('hub-message-fresh-m9')).toBeNull();
});

test('leaving the thread closes its typing room', async () => {
  await open(AMA);
  expect(typingRoom()).toBeTruthy();
  await screen.unmount();
  expect(typingRoom()).toBeUndefined();
});

test('the chat background has a faint starfield in three twinkling sets', async () => {
  await render(<AmbientGlow />);
  for (const set of [0, 1, 2]) expect(screen.getByTestId(`chat-stars-${set}`)).toBeOnTheScreen();
  expect(STARS).toHaveLength(27);
  for (const s of STARS) {
    expect(s.x).toBeGreaterThanOrEqual(0);
    expect(s.x).toBeLessThan(1);
    expect(s.size).toBeLessThanOrEqual(3);
  }
});
