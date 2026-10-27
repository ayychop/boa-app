import { act, render, screen, userEvent } from '@testing-library/react-native';
import { Alert, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as hub from '../src/api/hub';
import HubChatsScreen from '../src/screens/hub/HubChatsScreen';
import HubThreadScreen from '../src/screens/hub/NewChatScreen';
import { Waveform } from '../src/components/chat/media';
import { chatTime } from '../src/screens/hub/HubChatsScreen';
import { installCrashGuard } from '../src/utils/crashGuard';

jest.useFakeTimers();

// A Supabase client that behaves like the real one where it matters:
// asking for a channel name already in use hands back that channel, and
// adding postgres_changes listeners to one that has subscribed throws.
jest.mock('../src/lib/supabase', () => {
  const channels = [];
  const supabase = {
    channels,
    channel(name) {
      const found = channels.find((c) => c.name === name);
      if (found) return found;
      const c = {
        name,
        joined: false,
        on() {
          if (c.joined) throw new Error(`cannot add \`postgres_changes\` callbacks for realtime:${name} after \`subscribe()\`.`);
          return c;
        },
        subscribe() {
          c.joined = true;
          return c;
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

let mockNowPlayingThrows = false;
jest.mock('../src/components/hub/NowPlaying', () => {
  const Actual = jest.requireActual('../src/components/hub/NowPlaying').default;
  return (props) => {
    if (mockNowPlayingThrows) throw new Error('Now Playing failed to draw');
    return <Actual {...props} />;
  };
});

jest.mock('../src/context/HubContext', () => ({
  useHub: () => ({ userId: 'user-me', isOnline: () => false, blocked: new Set(), unblock: jest.fn(() => Promise.resolve()) }),
}));

jest.mock('../src/api/hub', () => ({
  ...jest.requireActual('../src/api/hub'),
  listConversations: jest.fn(),
  getConversation: jest.fn(),
  listMessages: jest.fn(),
  markRead: jest.fn(() => Promise.resolve()),
}));

const { supabase } = jest.requireMock('../src/lib/supabase');

const ME = 'user-me';
const AMA = { id: 'user-ama', username: 'ama', display_name: 'Ama Mensah', avatar_url: null, last_seen_at: null };
const conv = { id: 'conv-1', user_a: AMA.id, user_b: ME, otherId: AMA.id, other: AMA, last_message_preview: 'Hi', last_sender_id: AMA.id };
const navigation = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: () => true };
const flush = () => act(async () => {});

beforeEach(() => {
  jest.clearAllMocks();
  mockNowPlayingThrows = false;
  supabase.channels.length = 0;
  hub.listConversations.mockResolvedValue([conv]);
  hub.getConversation.mockResolvedValue(conv);
  hub.listMessages.mockResolvedValue([{ id: 'm1', conversation_id: 'conv-1', sender_id: AMA.id, body: 'Hi', created_at: new Date().toISOString() }]);
});

// The chat list stays mounted under the thread, both watching Ama's profile.
async function listThenThread() {
  await render(
    <NavigationContainer>
      <View style={{ flex: 1 }}>
        <HubChatsScreen navigation={navigation} />
        <HubThreadScreen navigation={navigation} route={{ params: { id: 'conv-1' } }} />
      </View>
    </NavigationContainer>,
  );
  await flush();
  await flush();
}

test('opening a conversation while the chat list watches the same person does not crash', async () => {
  await listThenThread();
  expect(screen.getByTestId('hub-thread')).toBeOnTheScreen();
  expect(screen.queryByTestId('hub-thread-fallback')).toBeNull();
  expect(screen.getAllByText('Hi').length).toBeGreaterThan(0);
  // Each subscriber has its own channel: no name is shared.
  const names = supabase.channels.map((c) => c.name);
  expect(new Set(names).size).toBe(names.length);
});

test('if part of the thread fails to draw, it shows a fallback with a retry instead of crashing', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const user = userEvent.setup();
  hub.getConversation.mockResolvedValue({ ...conv, other: { ...AMA, status_kind: 'listening', status_text: 'BOA Radio' } });
  mockNowPlayingThrows = true;
  await render(
    <NavigationContainer>
      <HubThreadScreen navigation={navigation} route={{ params: { id: 'conv-1' } }} />
    </NavigationContainer>,
  );
  await flush();
  expect(screen.getByTestId('hub-thread-fallback')).toBeOnTheScreen();
  expect(screen.getByText('Now Playing failed to draw')).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: 'Back' }));
  expect(navigation.goBack).toHaveBeenCalled();
  mockNowPlayingThrows = false;
  await user.press(screen.getByRole('button', { name: /Try again/ }));
  await flush();
  expect(screen.getByTestId('hub-thread')).toBeOnTheScreen();
});

test('a thread opened without an id says it was not found rather than spinning', async () => {
  await render(
    <NavigationContainer>
      <HubThreadScreen navigation={navigation} route={{ params: {} }} />
    </NavigationContainer>,
  );
  await flush();
  expect(screen.getByText("This conversation wasn't found.")).toBeOnTheScreen();
  expect(hub.getConversation).not.toHaveBeenCalled();
});

test('bad saved data draws safely: a waveform saved as text, a missing or broken timestamp', async () => {
  await render(<Waveform levels="[10,20,30]" />);
  await render(<Waveform levels={[NaN, 'x', 40]} />);
  expect(chatTime(null)).toBe('');
  expect(chatTime('not a date')).toBe('');
});

test('in a release build, an error from a button shows an alert instead of closing the app', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  let handler = null;
  const original = jest.fn();
  const errorUtils = { getGlobalHandler: () => original, setGlobalHandler: (h) => (handler = h) };
  expect(installCrashGuard(errorUtils, false)).toBe(true);
  handler(new Error('boom'), true);
  expect(alert).toHaveBeenCalledWith('Something went wrong', expect.any(String));
  expect(original).not.toHaveBeenCalled();
  // A burst of errors is one alert, not a stack of them.
  handler(new Error('boom again'), true);
  expect(alert).toHaveBeenCalledTimes(1);
  // In development the red screen still shows.
  expect(installCrashGuard(errorUtils, true)).toBe(false);
});
