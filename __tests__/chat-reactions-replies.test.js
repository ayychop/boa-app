import { act, fireEvent, render, screen, userEvent, within } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as hub from '../src/api/hub';
import HubThreadScreen from '../src/screens/hub/NewChatScreen';

jest.useFakeTimers();

const ME = 'user-me';
const AMA = { id: 'user-ama', username: 'ama', display_name: 'Ama Mensah', avatar_url: null, last_seen_at: null };

jest.mock('../src/context/HubContext', () => ({
  useHub: () => ({ userId: 'user-me', isOnline: () => false, blocked: new Set(), unblock: jest.fn(() => Promise.resolve()) }),
}));

jest.mock('../src/api/hub', () => ({
  ...jest.requireActual('../src/api/hub'),
  getConversation: jest.fn(),
  listMessages: jest.fn(),
  listReactions: jest.fn(),
  sendMessage: jest.fn(),
  sendSticker: jest.fn(),
  react: jest.fn(() => Promise.resolve()),
  unreact: jest.fn(() => Promise.resolve()),
  markRead: jest.fn(() => Promise.resolve()),
  deleteMessage: jest.fn(() => Promise.resolve()),
  canMessage: jest.fn(() => Promise.resolve(true)),
}));

const at = (min) => new Date(Date.UTC(2026, 9, 24, 12, min)).toISOString();
const conv = { id: 'conv-1', user_a: AMA.id, user_b: ME, otherId: AMA.id, other: AMA, theirReadAt: at(1) };
const messages = [
  { id: 'm2', conversation_id: 'conv-1', sender_id: AMA.id, body: 'Try call me', created_at: at(5) },
  { id: 'm1', conversation_id: 'conv-1', sender_id: ME, body: 'Yo keeps saying u on another call', created_at: at(2) },
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

const hold = async (id) => {
  await fireEvent(screen.getByTestId(`hub-message-${id}`), 'longPress');
  await flush();
};

let alert;
beforeEach(() => {
  jest.clearAllMocks();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  hub.getConversation.mockResolvedValue(conv);
  hub.listMessages.mockResolvedValue(messages);
  hub.listReactions.mockResolvedValue([]);
});

test('holding their message lifts it out with reactions and Reply, not an Android alert; Report sits apart', async () => {
  await openThread();
  await hold('m2');
  expect(alert).not.toHaveBeenCalled();
  const sheet = screen.getByTestId('message-actions');
  expect(within(sheet).getByTestId('message-reactions-bar')).toBeOnTheScreen();
  for (const e of ['❤️', '😂', '🔥', '😮', '😢', '🙏']) expect(within(sheet).getByTestId(`react-${e}`)).toBeOnTheScreen();
  expect(within(sheet).getByTestId('message-action-reply')).toBeOnTheScreen();
  // Their message: nothing to delete, and Report is a quiet link under the menu.
  expect(within(sheet).queryByTestId('message-action-delete')).toBeNull();
  expect(within(sheet).getByTestId('message-action-report')).toHaveTextContent(/Report this message$/);
  expect(within(sheet).getByText('Try call me')).toBeOnTheScreen();
});

test('a reaction attaches to the message at once, is saved, and comes off with a tap on its chip', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await openThread();
  await hold('m2');
  await user.press(screen.getByTestId('react-🔥'));
  await flush();
  expect(hub.react).toHaveBeenCalledWith('m2', '🔥');
  expect(screen.queryByTestId('message-actions')).toBeNull();
  const chip = screen.getByTestId('reaction-chip-🔥');
  expect(chip).toBeOnTheScreen();

  // Swapped for another: one reaction per person.
  await hold('m2');
  await user.press(screen.getByTestId('react-😂'));
  await flush();
  expect(hub.react).toHaveBeenLastCalledWith('m2', '😂');
  expect(screen.queryByTestId('reaction-chip-🔥')).toBeNull();

  await user.press(screen.getByTestId('reaction-chip-😂'));
  await flush();
  expect(hub.unreact).toHaveBeenCalledWith('m2', ME);
  expect(screen.queryByTestId('reaction-chip-😂')).toBeNull();
});

test('a refused reaction goes back and says why', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  hub.react.mockRejectedValueOnce(new Error("Reactions aren't switched on yet."));
  await openThread();
  await hold('m2');
  await user.press(screen.getByTestId('react-❤️'));
  await flush();
  expect(screen.queryByTestId('reaction-chip-❤️')).toBeNull();
  expect(alert).toHaveBeenCalledWith("Couldn't react", "Reactions aren't switched on yet.");
});

test('reactions already on the thread are shown, theirs and yours together', async () => {
  hub.listReactions.mockResolvedValue([
    { message_id: 'm1', user_id: AMA.id, emoji: '❤️' },
    { message_id: 'm1', user_id: ME, emoji: '❤️' },
    { message_id: 'm2', user_id: ME, emoji: '😂' },
  ]);
  await openThread();
  expect(hub.listReactions).toHaveBeenCalledWith(['m2', 'm1']);
  expect(screen.getByTestId('reaction-chip-❤️')).toHaveTextContent(/2$/);
  expect(screen.getByTestId('reaction-chip-😂')).toBeOnTheScreen();
});

test('double tap loves a message', async () => {
  await openThread();
  const bubble = screen.getByTestId('hub-message-m2');
  await fireEvent.press(bubble);
  await fireEvent.press(bubble);
  await flush();
  expect(hub.react).toHaveBeenCalledWith('m2', '❤️');
  expect(screen.getByTestId('reaction-chip-❤️')).toBeOnTheScreen();
});

test('Reply quotes their message over the composer and sends it as a reply, which shows the quote', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  hub.sendMessage.mockImplementation(async (c, body, opts) => ({ id: 'm3', conversation_id: c, sender_id: ME, body, reply_to: opts?.replyTo ?? null, created_at: at(6) }));
  await openThread();
  await hold('m2');
  await user.press(screen.getByTestId('message-action-reply'));
  expect(screen.getByTestId('composer-reply')).toHaveTextContent(/Replying to Ama Mensah/);
  expect(screen.getByTestId('composer-reply')).toHaveTextContent(/Try call me/);
  await user.type(screen.getByTestId('hub-composer'), 'Calling now');
  await user.press(screen.getByTestId('hub-send'));
  await flush();
  expect(hub.sendMessage).toHaveBeenCalledWith('conv-1', 'Calling now', { replyTo: 'm2' });
  expect(screen.queryByTestId('composer-reply')).toBeNull();
  const reply = screen.getByTestId('hub-message-m3');
  expect(within(reply).getByTestId('reply-quote')).toHaveTextContent(/Ama Mensah.*Try call me/);
});

test('the reply can be cancelled, and a plain message sends as before', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  hub.sendMessage.mockResolvedValue({ id: 'm3', conversation_id: 'conv-1', sender_id: ME, body: 'hi', created_at: at(6) });
  await openThread();
  await hold('m2');
  await user.press(screen.getByTestId('message-action-reply'));
  await user.press(screen.getByTestId('composer-reply-cancel'));
  expect(screen.queryByTestId('composer-reply')).toBeNull();
  await user.type(screen.getByTestId('hub-composer'), 'hi');
  await user.press(screen.getByTestId('hub-send'));
  expect(hub.sendMessage).toHaveBeenCalledWith('conv-1', 'hi');
});

test('your own message: delete it from the hold menu, no alert', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await openThread();
  await hold('m1');
  expect(screen.queryByTestId('message-action-report')).toBeNull();
  await user.press(screen.getByTestId('message-action-delete'));
  await flush();
  expect(hub.deleteMessage).toHaveBeenCalledWith('m1', null);
  expect(screen.queryByTestId('hub-message-m1')).toBeNull();
  expect(alert).not.toHaveBeenCalled();
});

test('Report opens the report sheet for that message', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await openThread();
  await hold('m2');
  await user.press(screen.getByTestId('message-action-report'));
  await flush();
  expect(screen.queryByTestId('message-actions')).toBeNull();
  expect(screen.getByText(/Report/)).toBeOnTheScreen();
});

test('the emoji button sends an animated emoji, drawn big with no bubble', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  hub.sendSticker.mockImplementation(async (c, emoji) => ({ id: 's1', conversation_id: c, sender_id: ME, kind: 'sticker', body: emoji, created_at: at(7) }));
  await openThread();
  await user.press(screen.getByTestId('hub-stickers'));
  expect(screen.getByTestId('sticker-picker')).toBeOnTheScreen();
  await user.press(screen.getByTestId('sticker-tab-Smileys and emotions'));
  await user.press(screen.getByTestId('sticker-😂'));
  await flush();
  expect(hub.sendSticker).toHaveBeenCalledWith('conv-1', '😂', { replyTo: null });
  expect(screen.getByTestId('hub-message-s1')).toHaveTextContent(/😂/);
});

test('More reactions opens the full set and puts the one picked on the message', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await openThread();
  await hold('m2');
  await user.press(screen.getByTestId('react-more'));
  expect(screen.getByText('React with anything')).toBeOnTheScreen();
  await user.press(screen.getByTestId('sticker-tab-Smileys and emotions'));
  await user.press(screen.getByTestId('sticker-😍'));
  await flush();
  expect(hub.react).toHaveBeenCalledWith('m2', '😍');
  expect(screen.getByTestId('reaction-chip-😍')).toBeOnTheScreen();
});
