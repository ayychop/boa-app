import { act, render, screen, userEvent } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';

jest.useFakeTimers();

// A stand-in Supabase: every query is a chain that resolves to whatever the
// test set for its table (or RPC), and every call is recorded.
const mockTables = {};
const mockCalls = [];
const mockRpc = jest.fn(async () => ({ data: null, error: null }));
// A table's stand-in can be a function of this query's own calls.
function mockChain(table) {
  const own = [];
  const chain = new Proxy(
    {},
    {
      get(_, key) {
        if (key === 'then') {
          const res = typeof mockTables[table] === 'function' ? mockTables[table](own) : mockTables[table];
          return (ok, bad) => Promise.resolve(res ?? { data: [], error: null, count: 0 }).then(ok, bad);
        }
        return (...args) => {
          const call = { table, key, args };
          own.push(call);
          mockCalls.push(call);
          return chain;
        };
      },
    },
  );
  return chain;
}
jest.mock('../src/lib/supabase', () => {
  const channel = { on: () => channel, subscribe: () => channel, send: jest.fn(), presenceState: () => ({}) };
  return {
    isConfigured: true,
    supabase: {
      from: (t) => mockChain(t),
      rpc: (...a) => mockRpc(...a),
      channel: () => channel,
      removeChannel: jest.fn(),
      storage: { from: () => ({ upload: jest.fn(async () => ({})), getPublicUrl: () => ({ data: { publicUrl: 'https://cdn/x.jpg' } }), remove: jest.fn(async () => ({})) }) },
    },
  };
});

const ME = { id: 'user-me', username: 'ama.directs', display_name: 'Ama Mensah', avatar_url: null, roles: ['music_producer'], bio: 'Producer from Peckham.', is_boa_star: true, visible_on_hub: true };
const KOFI = { id: 'user-kofi', username: 'kofi', display_name: 'Kofi Boateng', avatar_url: null, roles: ['singer'], bio: 'Vocals.', last_seen_at: null };

let mockHub;
jest.mock('../src/context/HubContext', () => ({ useHub: () => mockHub }));
jest.mock('../src/api/hub', () => ({
  ...jest.requireActual('../src/api/hub'),
  getProfile: jest.fn(async (id) => ({ 'user-me': ME, 'user-kofi': KOFI })[id] ?? null),
  startConversation: jest.fn(async () => 'conv-1'),
  searchProfiles: jest.fn(async () => ({ rows: [KOFI], more: false })),
}));

// The profile's favourites row needs the player and screening room; it's
// tested on its own below.
jest.mock('../src/components/profile/Favourites', () => () => null);

const splits = require('../src/api/splits');
const posts = require('../src/api/posts');
const dayOne = require('../src/api/dayOne');
const vibes = require('../src/chat/vibes');

const flush = () => act(async () => {});
const nav = () => ({ navigate: jest.fn(), goBack: jest.fn(), push: jest.fn(), replace: jest.fn() });

async function show(Screen, params = {}) {
  const navigation = nav();
  const view = await render(
    <NavigationContainer>
      <Screen navigation={navigation} route={{ params }} />
    </NavigationContainer>,
  );
  await flush();
  await flush();
  navigation.view = view;
  return navigation;
}

beforeEach(() => {
  Object.keys(mockTables).forEach((k) => delete mockTables[k]);
  mockCalls.length = 0;
  mockRpc.mockClear();
  dayOne.forgetDayOnes();
  vibes.resetChatVibe();
  mockHub = { userId: 'user-me', profile: ME, isOnline: () => false, blocked: new Set(), block: jest.fn(), unblock: jest.fn() };
});

describe('split sheets', () => {
  const two = (a, b) => [
    { user_id: 'user-me', role: 'Producer', share: a },
    { user_id: 'user-kofi', role: 'Vocalist', share: b },
  ];

  test('the shares must come to exactly 100%, between at least two people', () => {
    expect(splits.splitProblem({ title: 'Night Bus', parties: two('50', '50') })).toBeNull();
    expect(splits.splitProblem({ title: 'Night Bus', parties: two('60', '50') })).toMatch(/add up to 110%/);
    expect(splits.splitProblem({ title: 'Night Bus', parties: two('33.33', '66.67') })).toBeNull();
    expect(splits.splitProblem({ title: 'Night Bus', parties: two('50', '50').slice(0, 1) })).toMatch(/at least two/);
    expect(splits.splitProblem({ title: '', parties: two('50', '50') })).toMatch(/Name the work/);
    expect(splits.splitProblem({ title: 'Dup', parties: [two('50', '50')[0], { ...two('50', '50')[0] }] })).toMatch(/only be on a split once/);
    expect(splits.splitProblem({ title: 'Zero', parties: two('0', '100') })).toMatch(/more than 0%/);
  });

  test('an even split always totals 100', () => {
    expect(splits.evenShares(2)).toEqual([50, 50]);
    expect(splits.evenShares(3)).toEqual([33.34, 33.33, 33.33]);
    expect(splits.totalShare(splits.evenShares(7).map((share) => ({ share })))).toBe(100);
  });

  test("a sheet that doesn't add up is never sent", async () => {
    await expect(splits.createSheet('user-me', { title: 'Night Bus', parties: two('70', '20') })).rejects.toThrow(/add up to 90%/);
    expect(mockCalls).toHaveLength(0);
  });

  test('agreeing goes through the database, as you', async () => {
    mockRpc.mockResolvedValueOnce({ data: { signed: true, waiting: 0 }, error: null });
    await expect(splits.agreeToSheet('sheet-1')).resolves.toEqual({ signed: true, waiting: 0 });
    expect(mockRpc).toHaveBeenCalledWith('agree_to_split', { sheet: 'sheet-1' });
  });

  test('status reads from your side', () => {
    const sheet = {
      status: 'draft',
      parties: [
        { user_id: 'user-me', agreed_at: null },
        { user_id: 'user-kofi', agreed_at: 'x' },
      ],
    };
    expect(splits.sheetStatus(sheet, 'user-me').label).toBe('Waiting on you');
    expect(splits.sheetStatus(sheet, 'user-kofi').label).toBe('Waiting on 1');
    expect(splits.sheetStatus({ ...sheet, status: 'signed' }, 'user-me').label).toBe('Signed');
  });
});

describe('invoices', () => {
  test('totals, money and numbering', () => {
    const items = [
      { description: 'Mix and master', qty: '2', rate: '225' },
      { description: 'Stems', qty: 1, rate: '£49.50' },
    ];
    expect(splits.invoiceTotal(items)).toBe(499.5);
    expect(splits.money(1250, 'GBP')).toBe('£1,250.00');
    expect(splits.money(80, 'USD')).toBe('$80.00');
    expect(splits.nextInvoiceNumber([{ number: 'BOA-2026-0007' }, { number: 'BOA-2025-0099' }], 2026)).toBe('BOA-2026-0008');
    expect(splits.nextInvoiceNumber([], 2026)).toBe('BOA-2026-0001');
  });

  test('an invoice needs someone to bill and a priced line', () => {
    expect(splits.invoiceProblem({ clientName: '', items: [{ description: 'x', qty: 1, rate: 10 }] })).toMatch(/Who is the invoice for/);
    expect(splits.invoiceProblem({ clientName: 'Label', items: [{ description: '', qty: 1, rate: 10 }] })).toMatch(/at least one line/);
    expect(splits.invoiceProblem({ clientName: 'Label', items: [{ description: 'Mix', qty: 1, rate: '' }] })).toMatch(/quantity and a rate/);
    expect(splits.invoiceProblem({ clientName: 'Label', clientEmail: 'nope', items: [{ description: 'Mix', qty: 1, rate: 5 }] })).toMatch(/email/);
    expect(splits.invoiceProblem({ clientName: 'Label', items: [{ description: 'Mix', qty: 1, rate: 5 }] })).toBeNull();
  });

  test('the shared text has the lines and the total', () => {
    const text = splits.invoiceText(
      { number: 'BOA-2026-0001', client_name: 'Northside', client_email: null, due_date: null, currency: 'GBP', total: 450, notes: '', items: [{ description: 'Mix', qty: 1, rate: 450 }] },
      ME,
    );
    expect(text).toMatch(/INVOICE BOA-2026-0001/);
    expect(text).toMatch(/From: Ama Mensah/);
    expect(text).toMatch(/Total: £450.00/);
  });
});

describe('posts and Day One, the rules', () => {
  test('tags are usernames, each once', () => {
    expect(posts.parseTags('@Ama, kofi.beats @ama  x')).toEqual(['ama', 'kofi.beats']);
  });
  test('counts read short', () => {
    expect(posts.compactCount(1204)).toBe('1,204');
    expect(posts.compactCount(12400)).toBe('12.4K');
    expect(posts.compactCount(2500000)).toBe('2.5M');
  });
  test('a video over 64 MB is refused before it uploads', () => {
    expect(posts.postProblem({ uri: 'file://a', type: 'video', fileSize: 70 * 1024 * 1024 })).toMatch(/64 MB/);
    expect(posts.postProblem({ uri: 'file://a', type: 'image', fileSize: 1024 })).toBeNull();
  });
  test('a missing table reads as the database being behind', async () => {
    mockTables.posts = { data: null, error: { code: '42P01', message: 'relation "public.posts" does not exist' } };
    await expect(posts.listPosts('user-me')).rejects.toThrow(posts.OUT_OF_DATE);
  });

  test('Day One claims go through the database, which picks the place', async () => {
    mockRpc.mockResolvedValueOnce({ data: { rank: 12, day_one: true, new: true }, error: null });
    await expect(dayOne.claimDayOne('station', 'stn-1', 'Capital Xtra')).resolves.toMatchObject({ rank: 12, day_one: true });
    expect(mockRpc).toHaveBeenCalledWith('claim_day_one', { k: 'station', item: 'stn-1', label: 'Capital Xtra' });
    expect(dayOne.placeLine(12)).toBe('#12 of the first 1,000');
  });
});

describe('the Hub profile', () => {
  const HubProfileScreen = require('../src/screens/hub/HubProfileScreen').default;
  const POST = {
    id: 'p1',
    author_id: 'user-me',
    kind: 'image',
    media_url: 'https://cdn/p1.jpg',
    media_path: 'user-me/p1.jpg',
    caption: 'Studio night',
    tagged: [],
    created_at: '2026-10-25T20:00:00Z',
  };
  const REEL = { ...POST, id: 'p2', kind: 'video', media_url: 'https://cdn/p2.mp4', media_duration_ms: 31000, caption: 'Freestyle' };

  test('yours: a glowing ring for a BOA Star, stats, Edit profile and Splits, and no followers anywhere', async () => {
    mockTables.posts = (calls) => (calls.some((c) => c.key === 'select' && c.args[1]?.head) ? { count: 2, error: null } : { data: [POST, REEL], error: null });
    mockTables.day_one_claims = { data: [{ kind: 'station', item_id: 's1', item_label: 'Capital Xtra', rank: 12, first_at: '2026-10-20T00:00:00Z' }], error: null };
    const navigation = await show(HubProfileScreen);
    expect(screen.getByTestId('hub-my-profile')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-star-ring')).toBeOnTheScreen();
    expect(screen.getByTestId('boa-star')).toBeOnTheScreen();
    expect(screen.getAllByTestId('day-one').length).toBeGreaterThan(0);
    expect(screen.getByText('#12 of the first 1,000')).toBeOnTheScreen();
    expect(screen.getByText('Producer from Peckham.')).toBeOnTheScreen();
    expect(screen.getByTestId('stat-posts')).toHaveTextContent(/2\s*Posts/);
    expect(screen.getByTestId('post-tile-p1')).toBeOnTheScreen();
    expect(screen.queryByText(/Follow/i)).toBeNull();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByTestId('profile-splits'));
    expect(navigation.navigate).toHaveBeenCalledWith('HubSplits');
    await user.press(screen.getByTestId('profile-edit'));
    expect(navigation.navigate).toHaveBeenCalledWith('HubSettings');
    expect(screen.queryByTestId('chat-vibe-sheet')).toBeNull();
    await user.press(screen.getByTestId('profile-chat-vibe'));
    expect(screen.getByTestId('chat-vibe-sheet')).toBeOnTheScreen();
    await user.press(screen.getByTestId('post-tile-p2'));
    expect(navigation.navigate).toHaveBeenCalledWith('HubPost', { post: REEL });
  });

  test('the header is themed to the chosen Chat Vibe, so the Hub matches the thread', async () => {
    await vibes.setChatVibe('neon');
    mockTables.posts = (calls) => (calls.some((c) => c.key === 'select' && c.args[1]?.head) ? { count: 0, error: null } : { data: [], error: null });
    await show(HubProfileScreen, { id: 'user-kofi' });
    // The vibe-themed backdrop is on screen, and the profile still reads fine.
    expect(screen.getByTestId('profile-vibe-header')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-message')).toBeOnTheScreen();
    expect(screen.getByText('Kofi Boateng')).toBeOnTheScreen();
  });

  test("someone else's: Message (no Follow), and an empty grid that says so", async () => {
    mockTables.posts = (calls) => (calls.some((c) => c.key === 'select' && c.args[1]?.head) ? { count: 0, error: null } : { data: [], error: null });
    const navigation = await show(HubProfileScreen, { id: 'user-kofi' });
    expect(screen.getByTestId('hub-profile')).toBeOnTheScreen();
    expect(screen.queryByTestId('profile-star-ring')).toBeNull();
    expect(screen.getByTestId('profile-empty-posts')).toHaveTextContent(/No posts yet/);
    expect(screen.queryByText(/Follow/i)).toBeNull();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByTestId('profile-tab-tagged'));
    await flush();
    expect(screen.getByTestId('profile-empty-tagged')).toBeOnTheScreen();
    await user.press(screen.getByTestId('profile-message'));
    await flush();
    expect(navigation.navigate).toHaveBeenCalledWith('HubThread', { id: 'conv-1' });
  });
});

describe('Splits screens', () => {
  test('a new sheet starts with you at 100% and splits evenly as people join', async () => {
    const HubSplitSheetScreen = require('../src/screens/hub/HubSplitSheetScreen').default;
    await show(HubSplitSheetScreen);
    expect(screen.getByTestId('split-editor')).toBeOnTheScreen();
    expect(screen.getByTestId('split-total')).toHaveTextContent(/100%/);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByTestId('split-add-party'));
    await act(async () => jest.advanceTimersByTime(400));
    await flush();
    await user.press(screen.getByTestId('pick-user-kofi'));
    expect(screen.getByTestId('share-user-me')).toHaveDisplayValue('50');
    expect(screen.getByTestId('share-user-kofi')).toHaveDisplayValue('50');
    expect(screen.getByTestId('split-total')).toHaveTextContent(/100%/);
  });

  test('the invoice total adds up as you type', async () => {
    const HubInvoiceScreen = require('../src/screens/hub/HubInvoiceScreen').default;
    mockTables.invoices = { data: [], error: null };
    await show(HubInvoiceScreen, {});
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.type(screen.getByTestId('item-desc-0'), 'Mix');
    await user.clear(screen.getByTestId('item-qty-0'));
    await user.type(screen.getByTestId('item-qty-0'), '2');
    await user.type(screen.getByTestId('item-rate-0'), '225');
    expect(screen.getByTestId('invoice-total')).toHaveTextContent('£450.00');
  });

  test('the Splits home shows an empty state for each list', async () => {
    const HubSplitsScreen = require('../src/screens/hub/HubSplitsScreen').default;
    mockTables.split_sheets = { data: [], error: null };
    mockTables.invoices = { data: [], error: null };
    await show(HubSplitsScreen);
    expect(screen.getByTestId('splits-empty-sheets')).toBeOnTheScreen();
  });
});

describe('Day One in chat', () => {
  test('a chat row shows the badge for a Day One', async () => {
    const { ThreadRow } = require('../src/screens/hub/HubChatsScreen');
    const conv = { id: 'c1', otherId: 'user-kofi', other: KOFI, last_message_at: new Date().toISOString(), last_message_preview: 'Yo', last_sender_id: 'user-kofi', unread: false };
    await render(<ThreadRow conv={conv} index={0} myId="user-me" online={false} dayOne onPress={() => {}} />);
    expect(screen.getByTestId('day-one')).toBeOnTheScreen();
  });

  test('holders are looked up once and cached', async () => {
    mockTables.day_one_claims = { data: [{ user_id: 'user-kofi' }], error: null };
    expect([...(await dayOne.dayOneHolders(['user-kofi', 'user-zara']))]).toEqual(['user-kofi']);
    const before = mockCalls.length;
    expect([...(await dayOne.dayOneHolders(['user-kofi']))]).toEqual(['user-kofi']);
    expect(mockCalls.length).toBe(before);
  });
});

describe('hearts', () => {
  const hearts = require('../src/api/hearts');
  const HubPostScreen = require('../src/screens/hub/HubPostScreen').default;
  const POST = { id: 'p9', author_id: 'user-kofi', kind: 'image', media_url: 'https://cdn/p9.jpg', media_path: 'user-kofi/p9.jpg', caption: 'On set', tagged: [], created_at: '2026-10-25T20:00:00Z' };

  test("a double tap hearts someone's photo, with no count anywhere", async () => {
    mockTables.hearts = { data: [], error: null };
    await show(HubPostScreen, { post: POST });
    expect(screen.queryByText(/\d+\s*(likes?|hearts?)/i)).toBeNull();
    expect(screen.getByText('Double tap to heart')).toBeOnTheScreen();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByTestId('post-media'));
    await user.press(screen.getByTestId('post-media'));
    await flush();
    const up = mockCalls.find((c) => c.table === 'hearts' && c.key === 'upsert');
    expect(up.args[0]).toMatchObject({ liker_id: 'user-me', target_kind: 'post', target_id: 'p9' });
    expect(screen.getByText('Only they know you hearted this')).toBeOnTheScreen();
    expect(screen.getByTestId('post-heart')).toHaveProp('accessibilityState', { selected: true });
  });

  test('your own post has no heart button', async () => {
    await show(HubPostScreen, { post: { ...POST, author_id: 'user-me' } });
    expect(screen.queryByTestId('post-heart')).toBeNull();
  });

  test('when you last opened your hearts is kept on the phone, never sent', async () => {
    await hearts.markHeartsSeen('2026-10-26T10:00:00.000Z');
    expect(await hearts.heartsSeenAt()).toBe('2026-10-26T10:00:00.000Z');
    expect(mockCalls).toHaveLength(0);
  });

  test("the hearts inbox opens the liker's profile", async () => {
    const HubHeartsScreen = require('../src/screens/hub/HubHeartsScreen').default;
    mockHub = { ...mockHub, seeHearts: jest.fn() };
    mockTables.hearts = { data: [{ liker_id: 'user-kofi', target_id: 'p1', created_at: new Date().toISOString() }], error: null };
    mockTables.posts = { data: [{ id: 'p1', kind: 'image', media_url: 'https://cdn/p1.jpg', author_id: 'user-me', caption: '', created_at: new Date().toISOString() }], error: null };
    const navigation = await show(HubHeartsScreen);
    await flush();
    expect(mockHub.seeHearts).toHaveBeenCalled();
    expect(screen.getByText(/loved your photo/)).toBeOnTheScreen();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.press(screen.getByTestId('heart-row-user-kofi'));
    expect(navigation.navigate).toHaveBeenCalledWith('HubProfile', { id: 'user-kofi' });
  });
});

describe('message privacy', () => {
  const hub = require('../src/api/hub');
  const HubProfileScreen = require('../src/screens/hub/HubProfileScreen').default;

  test("someone who's turned messages off shows Messages off instead of Message", async () => {
    mockRpc.mockImplementation(async (name) => (name === 'accepts_messages' ? { data: false, error: null } : { data: null, error: null }));
    await show(HubProfileScreen, { id: 'user-kofi' });
    await flush();
    expect(screen.getByTestId('profile-messages-off')).toBeOnTheScreen();
    expect(screen.queryByTestId('profile-message')).toBeNull();
    mockRpc.mockImplementation(async () => ({ data: null, error: null }));
  });

  test('a refused send reads plainly', async () => {
    mockTables.messages = { data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "messages"' } };
    await expect(hub.sendMessage('conv-1', 'yo')).rejects.toThrow(hub.MESSAGES_CLOSED);
  });

  test('the three choices', () => {
    expect(hub.MESSAGE_PRIVACY.map((o) => o.id)).toEqual(['everyone', 'chatted', 'nobody']);
  });
});
