import { act, render, screen, userEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as hub from '../src/api/hub';
import HubChatsScreen from '../src/screens/hub/HubChatsScreen';
import HubThreadScreen from '../src/screens/hub/HubThreadScreen';

jest.useFakeTimers();

const ME = 'user-me';
const AMA = { id: 'user-ama', username: 'ama', display_name: 'Ama Mensah', avatar_url: null, last_seen_at: null };

let mockBlocked = new Set();
jest.mock('../src/context/HubContext', () => ({
  useHub: () => ({ userId: 'user-me', isOnline: () => false, blocked: mockBlocked, unblock: jest.fn(() => Promise.resolve()) }),
}));

jest.mock('../src/api/hub', () => ({
  ...jest.requireActual('../src/api/hub'),
  listConversations: jest.fn(),
  getConversation: jest.fn(),
  listMessages: jest.fn(),
  sendMessage: jest.fn(),
  markRead: jest.fn(() => Promise.resolve()),
  deleteMessage: jest.fn(() => Promise.resolve()),
}));

const at = (min) => new Date(Date.UTC(2026, 9, 24, 12, min)).toISOString();
const conv = {
  id: 'conv-1',
  user_a: AMA.id,
  user_b: ME,
  otherId: AMA.id,
  other: AMA,
  last_message_at: at(5),
  last_message_preview: 'Are you free Friday?',
  last_sender_id: AMA.id,
  theirReadAt: at(3),
  unread: true,
};
const messages = [
  { id: 'm2', conversation_id: 'conv-1', sender_id: AMA.id, body: 'Are you free Friday?', created_at: at(5) },
  { id: 'm1', conversation_id: 'conv-1', sender_id: ME, body: 'Loved your reel', created_at: at(2) },
];

const navigation = { navigate: jest.fn(), goBack: jest.fn() };
const flush = () => act(async () => {});

async function openThread() {
  await render(
    <NavigationContainer>
      <HubThreadScreen navigation={navigation} route={{ params: { id: 'conv-1' } }} />
    </NavigationContainer>,
  );
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBlocked = new Set();
  hub.listConversations.mockResolvedValue([conv]);
  hub.getConversation.mockResolvedValue(conv);
  hub.listMessages.mockResolvedValue(messages);
});

test('Messages lists each thread with its preview and unread state, and opens it', async () => {
  const user = userEvent.setup();
  await render(
    <NavigationContainer>
      <HubChatsScreen navigation={navigation} />
    </NavigationContainer>,
  );
  await flush();
  expect(hub.listConversations).toHaveBeenCalledWith(ME);
  const row = screen.getByRole('button', { name: /^Ama Mensah, unread: Are you free Friday\?/ });
  await user.press(row);
  expect(navigation.navigate).toHaveBeenCalledWith('HubThread', { id: 'conv-1' });
});

test('with no threads yet, Messages points to the directory', async () => {
  const user = userEvent.setup();
  hub.listConversations.mockResolvedValue([]);
  await render(
    <NavigationContainer>
      <HubChatsScreen navigation={navigation} />
    </NavigationContainer>,
  );
  await flush();
  expect(screen.getByText('No messages yet')).toBeOnTheScreen();
  await user.press(screen.getAllByRole('button', { name: 'Find talent' }).at(-1));
  expect(navigation.navigate).toHaveBeenCalledWith('HubDirectory');
});

test('a thread shows the conversation and marks it read', async () => {
  await openThread();
  expect(screen.getByText('Ama Mensah')).toBeOnTheScreen();
  expect(screen.getByText('Are you free Friday?')).toBeOnTheScreen();
  expect(screen.getByText('Loved your reel')).toBeOnTheScreen();
  expect(hub.markRead).toHaveBeenCalledWith('conv-1');
  // Ama read up to 12:03, after your 12:02 message.
  expect(screen.getByText(/· Seen/)).toBeOnTheScreen();
});

test('sending shows the message at once, then the saved one', async () => {
  const user = userEvent.setup();
  let resolve;
  hub.sendMessage.mockReturnValue(new Promise((r) => (resolve = r)));
  await openThread();
  await user.type(screen.getByTestId('hub-composer'), '  Yes, Friday works ');
  await user.press(screen.getByTestId('hub-send'));
  expect(hub.sendMessage).toHaveBeenCalledWith('conv-1', 'Yes, Friday works');
  expect(screen.getByText('Yes, Friday works')).toBeOnTheScreen();
  expect(screen.getByText(/Sending…/)).toBeOnTheScreen();
  expect(screen.getByTestId('hub-composer').props.value).toBe('');
  await act(async () => resolve({ id: 'm3', conversation_id: 'conv-1', sender_id: ME, body: 'Yes, Friday works', created_at: at(6) }));
  expect(screen.queryByText(/Sending…/)).toBeNull();
  expect(screen.getByTestId('hub-message-m3')).toBeOnTheScreen();
});

test('a message that fails to send says so and keeps its text', async () => {
  const user = userEvent.setup();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  hub.sendMessage.mockRejectedValue(new Error('cannot message this person'));
  await openThread();
  await user.type(screen.getByTestId('hub-composer'), 'Hello?');
  await user.press(screen.getByTestId('hub-send'));
  await flush();
  expect(alert).toHaveBeenCalledWith('Message not sent', 'cannot message this person');
  expect(screen.getByText('Hello?')).toBeOnTheScreen();
  expect(screen.getByText(/Not sent/)).toBeOnTheScreen();
});

test('an empty message is never sent', async () => {
  const user = userEvent.setup();
  await openThread();
  await user.type(screen.getByTestId('hub-composer'), '   ');
  await user.press(screen.getByTestId('hub-send'));
  expect(hub.sendMessage).not.toHaveBeenCalled();
});

test('with someone you blocked, the composer is replaced by Unblock', async () => {
  mockBlocked = new Set([AMA.id]);
  await openThread();
  expect(screen.queryByTestId('hub-composer')).toBeNull();
  expect(screen.getByText(/You've blocked Ama Mensah/)).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: /Unblock/ })).toBeOnTheScreen();
});

test("a thread that can't load offers to try again", async () => {
  const user = userEvent.setup();
  hub.getConversation.mockRejectedValueOnce(new Error('offline'));
  await openThread();
  expect(screen.getByText("Couldn't open this conversation")).toBeOnTheScreen();
  await user.press(screen.getByRole('button', { name: /Try again/ }));
  await flush();
  expect(screen.getByText('Are you free Friday?')).toBeOnTheScreen();
});
