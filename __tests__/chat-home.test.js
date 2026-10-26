import { act, render, screen, userEvent } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';

jest.useFakeTimers();

// Supabase and the Hub's state, stood in.
jest.mock('../src/context/HubContext', () => ({
  useHub: () => ({
    userId: 'user-me',
    profile: { id: 'user-me', username: 'ama.directs', display_name: 'Ama Mensah', avatar_url: null, roles: ['director'], quote_category: 'career' },
    isOnline: (id) => id === 'user-kofi',
    blocked: new Set(),
  }),
}));
jest.mock('../src/api/hub', () => ({
  ...jest.requireActual('../src/api/hub'),
  listConversations: jest.fn(),
  listNewMembers: jest.fn(),
  listSuggested: jest.fn(),
}));

describe('the Chat Hub home', () => {
  const ME = { id: 'user-me', username: 'ama.directs', display_name: 'Ama Mensah', avatar_url: null, roles: ['director'], quote_category: 'career' };
  const KOFI = { id: 'user-kofi', username: 'kofi', display_name: 'Kofi Boateng', avatar_url: null, roles: ['cinematographer'], open_for_work: true };
  const ZARA = { id: 'user-zara', username: 'zara', display_name: 'Zara Ali', avatar_url: null, roles: ['director'] };

  let mockRows = [];
  beforeEach(() => {
    jest.clearAllMocks();
    const hub = require('../src/api/hub');
    hub.listConversations.mockImplementation(async () => mockRows);
    hub.listNewMembers.mockResolvedValue([KOFI]);
    hub.listSuggested.mockResolvedValue([ZARA, KOFI]);
  });

  async function renderHome() {
    const ChatHome = require('../src/screens/hub/ChatHome').default;
    const navigation = { navigate: jest.fn() };
    await render(
      <NavigationContainer>
        <ChatHome navigation={navigation} bottomPadding={100} />
      </NavigationContainer>,
    );
    await act(async () => {});
    return navigation;
  }

  test('with no messages it is never empty: the Daily Spark, the Pulse and a way to start', async () => {
    mockRows = [];
    const navigation = await renderHome();
    expect(screen.getByTestId('daily-spark-category')).toHaveTextContent(/Career · Ambition/);
    expect(screen.getByText('Featured talent')).toBeOnTheScreen();
    expect(screen.getByText('New on the Hub')).toBeOnTheScreen();
    expect(screen.getByText('Creatives for you')).toBeOnTheScreen();
    // Someone already in "New" isn't suggested twice.
    expect(screen.getAllByTestId('pulse-person-user-kofi')).toHaveLength(1);
    expect(screen.getByTestId('pulse-person-user-zara')).toBeOnTheScreen();
    expect(screen.getByText('Open for work')).toBeOnTheScreen();
    expect(screen.getByTestId('chat-empty')).toBeOnTheScreen();
    const hub = require('../src/api/hub');
    expect(hub.listSuggested).toHaveBeenCalledWith({ roles: ['director'], excludeId: 'user-me' });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
    await user.press(screen.getByTestId('pulse-person-user-zara'));
    expect(navigation.navigate).toHaveBeenCalledWith('HubProfile', { id: 'user-zara' });
  });

  test('conversations show as large frosted rows; online people get the gold ring', async () => {
    mockRows = [
      { id: 'conv-1', otherId: KOFI.id, other: KOFI, last_message_at: new Date().toISOString(), last_message_preview: 'Shoot on Friday?', last_sender_id: KOFI.id, unread: true },
    ];
    await renderHome();
    expect(screen.getByTestId('hub-thread-conv-1')).toBeOnTheScreen();
    expect(screen.getByText('Shoot on Friday?')).toBeOnTheScreen();
    expect(screen.queryByTestId('chat-empty')).toBeNull();
    // Kofi is online: his avatars (row and Pulse card) carry the gold ring.
    expect(screen.getAllByTestId('avatar-gold-ring').length).toBeGreaterThanOrEqual(2);
  });

  test('the studio row is Splits and your profile, with no Cipher anywhere', async () => {
    mockRows = [];
    const navigation = await renderHome();
    expect(screen.getByText('Show your work, get paid')).toBeOnTheScreen();
    expect(screen.queryByText(/Cipher/)).toBeNull();
    expect(screen.queryByTestId('tool-cipher')).toBeNull();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
    await user.press(screen.getByTestId('tool-splits'));
    expect(navigation.navigate).toHaveBeenCalledWith('HubSplits');
  });

});
