import { act, render, screen, userEvent, within } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';

jest.useFakeTimers();

let mockAdmin = true;
jest.mock('../src/context/HubContext', () => ({ useHub: () => ({ isAdmin: mockAdmin, userId: 'user-boss' }) }));
jest.mock('../src/api/admin', () => ({
  listUsers: jest.fn(),
  listReports: jest.fn(),
  listAllCalls: jest.fn(),
  listBlocks: jest.fn(async () => []),
  evidenceLink: jest.fn(async () => null),
  setSubscription: jest.fn(async () => {}),
  setBoaStar: jest.fn(async () => {}),
  setFeatured: jest.fn(async () => {}),
  setBanned: jest.fn(async () => {}),
  setReportStatus: jest.fn(async () => {}),
  setCallApproved: jest.fn(async () => {}),
  updateCall: jest.fn(async () => {}),
  deleteCall: jest.fn(async () => {}),
  deleteUser: jest.fn(async () => ({ deleted: 'u-ama' })),
}));
jest.mock('../src/api/trending', () => ({
  ...jest.requireActual('../src/api/trending'),
  listTrending: jest.fn(),
  addTrending: jest.fn(async () => {}),
  removeTrending: jest.fn(async () => {}),
  reorderTrending: jest.fn(async () => {}),
}));
const admin = require('../src/api/admin');
const trending = require('../src/api/trending');

const AMA = { id: 'u-ama', username: 'ama', display_name: 'Ama Mensah', roles: ['director'], is_boa_star: false, is_featured: false, visible_on_hub: true };
const BOSS = { id: 'user-boss', username: 'boss', display_name: 'BOA Admin', roles: [], is_boa_star: false, is_featured: false, visible_on_hub: true };
const KOFI = { id: 'u-kofi', username: 'kofi', display_name: 'Kofi', roles: ['actor'], is_boa_star: true, is_featured: true, visible_on_hub: true };
const REPORT = {
  id: 'r1',
  reason: 'scam',
  status: 'open',
  message_excerpt: 'Pay me £200 to audition',
  reporter: { id: 'u-ama', username: 'ama', display_name: 'Ama Mensah' },
  reported: { id: 'u-scam', username: 'scammer', display_name: 'Scammer', banned_at: null },
};
const PENDING = { id: 'c1', title: 'Brand film', role_needed: 'Model', location: 'London', budget_amount: 3000, is_boa_original: false, approved: false, is_open: true };

const navigation = { goBack: jest.fn(), navigate: jest.fn() };

async function show() {
  const AdminDashboard = require('../src/screens/admin/AdminDashboard').default;
  await render(
    <NavigationContainer>
      <AdminDashboard navigation={navigation} />
    </NavigationContainer>,
  );
  await act(async () => {
    await jest.advanceTimersByTimeAsync(400);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAdmin = true;
  admin.listUsers.mockResolvedValue([AMA, KOFI]);
  admin.listReports.mockResolvedValue([REPORT]);
  admin.listAllCalls.mockResolvedValue([PENDING]);
  trending.listTrending.mockResolvedValue([]);
});

test('non-admins only see a locked door, and nothing is loaded', async () => {
  mockAdmin = false;
  await show();
  expect(screen.getByTestId('admin-locked')).toBeOnTheScreen();
  expect(screen.getByText('Admins only')).toBeOnTheScreen();
  expect(admin.listUsers).not.toHaveBeenCalled();
});

test('the control room counts what needs attention', async () => {
  await show();
  expect(screen.getByTestId('admin-dashboard')).toBeOnTheScreen();
  expect(screen.getByTestId('admin-count-reports')).toHaveTextContent(/^1/);
  expect(screen.getByTestId('admin-count-pending')).toHaveTextContent(/^1/);
});

test('Talent: every member with avatar, @username and roles; "Badge as BOA Star" sets is_boa_star', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
  await show();
  expect(screen.getByText('@ama')).toBeOnTheScreen();
  expect(screen.getByText('Director')).toBeOnTheScreen();
  // Kofi already shines.
  expect(screen.getAllByTestId('boa-star')).toHaveLength(1);
  await user.press(screen.getByTestId('admin-star-ama'));
  await act(async () => {});
  expect(admin.setBoaStar).toHaveBeenCalledWith('u-ama', true);
  expect(admin.listUsers).toHaveBeenCalledTimes(2);
});

test('Moderation: read the reported message, then ban (after confirming) or dismiss', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((title, msg, buttons) => buttons?.find((b) => b.text === 'Ban')?.onPress());
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
  await show();
  await user.press(screen.getByTestId('admin-tab-moderation'));
  expect(screen.getByText('"Pay me £200 to audition"')).toBeOnTheScreen();
  await user.press(screen.getByTestId('admin-ban-r1'));
  await act(async () => {});
  expect(alert).toHaveBeenCalled();
  expect(admin.setBanned).toHaveBeenCalledWith('u-scam', true);
  expect(admin.setReportStatus).toHaveBeenCalledWith('r1', 'actioned');
  await user.press(screen.getByTestId('admin-dismiss-r1'));
  await act(async () => {});
  expect(admin.setReportStatus).toHaveBeenCalledWith('r1', 'dismissed');
});

test('Casting: approve, edit and delete', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation((title, msg, buttons) => buttons?.find((b) => b.text === 'Delete')?.onPress());
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
  await show();
  await user.press(screen.getByTestId('admin-tab-casting'));
  expect(within(screen.getByTestId('admin-call-c1')).getByText(/£3,000 · AWAITING REVIEW/)).toBeOnTheScreen();
  await user.press(screen.getByTestId('admin-approve-c1'));
  await act(async () => {});
  expect(admin.setCallApproved).toHaveBeenCalledWith('c1', true);

  await user.press(screen.getByTestId('admin-edit-c1'));
  await user.clear(screen.getByTestId('admin-edit-title'));
  await user.type(screen.getByTestId('admin-edit-title'), 'Brand film (2 days)');
  await user.press(screen.getByText('Save changes'));
  await act(async () => {});
  expect(admin.updateCall).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 'Brand film (2 days)' }));

  await user.press(screen.getByTestId('admin-delete-c1'));
  await act(async () => {});
  expect(admin.deleteCall).toHaveBeenCalledWith('c1');
});

test('Pulse: feature someone in the Chat Hub', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
  await show();
  await user.press(screen.getByTestId('admin-tab-pulse'));
  expect(screen.getByText('FEATURED IN THE PULSE')).toBeOnTheScreen();
  await user.press(screen.getByTestId('admin-feature-ama'));
  await act(async () => {});
  expect(admin.setFeatured).toHaveBeenCalledWith('u-ama', true);
});

describe('Radio: Trending on BOA Radio', () => {
  const { catalogue } = jest.requireActual('../src/api/trending');
  const [first, second, third] = catalogue();

  test("the catalogue is BOA's curated stations, each once", () => {
    const ids = catalogue().map((s) => s.id);
    expect(ids.length).toBeGreaterThan(3);
    expect(new Set(ids).size).toBe(ids.length);
    expect(first.genreLabel).toBeTruthy();
  });

  test('nothing picked: Home uses its automatic picks; switching a station on adds it to the end', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
    await show();
    await user.press(screen.getByTestId('admin-tab-radio'));
    expect(screen.getByText(/AUTOMATIC TIER 1 PICKS/)).toBeOnTheScreen();
    await user.press(screen.getByTestId(`admin-trending-toggle-${first.id}`));
    await act(async () => {});
    expect(trending.addTrending).toHaveBeenCalledWith(expect.objectContaining({ id: first.id, streamUrl: first.streamUrl }), 0);
  });

  test('picked stations show in order; move, and take off', async () => {
    trending.listTrending.mockResolvedValue([first, second, third]);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
    await show();
    await user.press(screen.getByTestId('admin-tab-radio'));
    expect(screen.getByText('ON HOME NOW · 3 STATIONS')).toBeOnTheScreen();
    await user.press(screen.getByTestId(`admin-trending-down-${first.id}`));
    await act(async () => {});
    expect(trending.reorderTrending).toHaveBeenCalledWith([second.id, first.id, third.id]);
    await user.press(screen.getByTestId(`admin-trending-remove-${third.id}`));
    await act(async () => {});
    expect(trending.removeTrending).toHaveBeenCalledWith(third.id);
  });

  test('searching narrows the catalogue', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
    await show();
    await user.press(screen.getByTestId('admin-tab-radio'));
    await user.type(screen.getByTestId('admin-radio-search'), first.name);
    expect(screen.getByTestId(`admin-station-${first.id}`)).toBeOnTheScreen();
    expect(screen.queryAllByTestId(/^admin-station-/).length).toBeLessThan(catalogue().length);
  });
});

test('Delete User: confirm, then the delete-user function wipes the account; never your own', async () => {
  admin.listUsers.mockResolvedValue([AMA, KOFI, BOSS]);
  let buttons = null;
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((title, msg, b) => {
    buttons = b;
  });
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
  await show();
  expect(screen.getByTestId('admin-delete-user-ama')).toBeOnTheScreen();
  expect(screen.getByTestId('admin-delete-user-kofi')).toBeOnTheScreen();
  expect(screen.queryByTestId('admin-delete-user-boss')).toBeNull();

  await user.press(screen.getByTestId('admin-delete-user-ama'));
  expect(alert).toHaveBeenCalledWith('Delete Ama Mensah?', expect.stringMatching(/cannot be undone/), expect.any(Array));
  // Cancel does nothing.
  expect(admin.deleteUser).not.toHaveBeenCalled();
  await act(async () => buttons.find((b) => b.text === 'Delete forever').onPress());
  expect(admin.deleteUser).toHaveBeenCalledWith('u-ama');
  expect(admin.listUsers).toHaveBeenCalledTimes(2);
  alert.mockRestore();
});

describe('delete-user Edge Function and cascades', () => {
  const fs = require('fs');
  const path = require('path');
  const fn = fs.readFileSync(path.join(__dirname, '../supabase/functions/delete-user/index.ts'), 'utf8');
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261027090000_delete_user_cascade.sql'), 'utf8');

  test('only an admin can call it, with the service role doing the delete', () => {
    expect(fn).toMatch(/caller\.rpc\('is_admin'\)/);
    expect(fn).toMatch(/isAdmin !== true\) return json\(\{ error: 'Admins only\.' \}, 403\)/);
    expect(fn).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(fn).toMatch(/admin\.auth\.admin\.deleteUser\(userId, false\)/);
    expect(fn).toMatch(/userId === me\.user\.id/);
    // Files are cleared too: Storage isn't covered by database cascades.
    for (const bucket of ['chat-media', 'avatars', 'posts', 'block-evidence']) expect(fn).toContain(`'${bucket}'`);
  });

  test('the migration turns blocking foreign keys into cascades and checks the promised tables', () => {
    expect(sql).toMatch(/confdeltype in \('a', 'r'\)/);
    expect(sql).toMatch(/ON DELETE CASCADE/);
    for (const t of ['profiles', 'posts', 'messages', 'blocks']) expect(sql).toContain(`('${t}',`);
  });

  test('every foreign key to a member in every migration says what happens on delete', () => {
    const dir = path.join(__dirname, '../supabase/migrations');
    for (const file of fs.readdirSync(dir)) {
      const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
      for (const line of lines.filter((l) => /references (public\.profiles|auth\.users)/.test(l))) {
        expect(`${file}: ${line.trim()}`).toMatch(/on delete (cascade|set null)/);
      }
    }
  });
});
