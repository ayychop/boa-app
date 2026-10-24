import { act, render, screen, userEvent } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as fs from 'fs';
import * as path from 'path';

jest.useFakeTimers();

let mockHub = { stage: 'ready', userId: 'user-me' };
jest.mock('../src/context/HubContext', () => ({ useHub: () => mockHub }));

const mockFrom = jest.fn();
jest.mock('../src/lib/supabase', () => ({ isConfigured: true, supabase: { from: (...a) => mockFrom(...a) } }));

const casting = require('../src/api/casting');

const ORIGINAL = {
  id: 'b0a00000-0000-4000-8000-000000000001',
  title: 'Mind States UK: Series Casting',
  description: 'BOA Network is casting the next chapter of Mind States UK.',
  role_needed: 'Actor',
  budget_amount: null,
  is_boa_original: true,
  location: 'London, United Kingdom',
  is_open: true,
  approved: true,
};
const GIG = {
  id: 'gig-1',
  producer_id: 'user-kofi',
  title: 'Music video lead',
  description: 'Lead for a music video shoot in Manchester.',
  role_needed: 'Actor',
  budget_amount: 2500,
  is_boa_original: false,
  location: 'Manchester',
  is_open: true,
  approved: true,
};

describe('the budget rules', () => {
  test('external gigs under £1,000 are refused, in BOA\'s words', () => {
    expect(casting.BUDGET_MESSAGE).toBe('BOA maintains a premium standard. Minimum budget is £1,000.');
    expect(casting.budgetProblem({ isBoaOriginal: false, budget: 999.99 })).toBe(casting.BUDGET_MESSAGE);
    expect(casting.budgetProblem({ isBoaOriginal: false, budget: '£999' })).toBe(casting.BUDGET_MESSAGE);
    expect(casting.budgetProblem({ isBoaOriginal: false, budget: '' })).toBe(casting.BUDGET_MESSAGE);
    expect(casting.budgetProblem({ isBoaOriginal: false, budget: 1000 })).toBeNull();
    expect(casting.budgetProblem({ isBoaOriginal: false, budget: '£2,500' })).toBeNull();
  });

  test('BOA Originals skip the check entirely', () => {
    expect(casting.budgetProblem({ isBoaOriginal: true, budget: null })).toBeNull();
    expect(casting.budgetProblem({ isBoaOriginal: true, budget: 0 })).toBeNull();
  });

  test('a gig under £1,000 is never even sent', async () => {
    await expect(
      casting.postCastingCall({ producerId: 'u', title: 'Low', description: 'Too cheap a shoot.', roleNeeded: 'Actor', budget: '750', location: 'Leeds' }),
    ).rejects.toThrow(casting.BUDGET_MESSAGE);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test("the database's own minimum reads the same way", async () => {
    mockFrom.mockReturnValue({
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'new row violates check constraint "casting_calls_budget_minimum"' } }) }) }),
    });
    await expect(
      casting.postCastingCall({ producerId: 'u', title: 'Gig', description: 'A real music video shoot.', roleNeeded: 'Actor', budget: '1000', location: 'Leeds' }),
    ).rejects.toThrow(casting.BUDGET_MESSAGE);
  });

  test('money reads as sterling', () => {
    expect(casting.formatBudget(2500)).toBe('£2,500');
    expect(casting.formatBudget(1250.5)).toBe('£1,250.50');
    expect(casting.parseBudget('£1,000')).toBe(1000);
  });

  test('an application needs a tape or a note, and a tape must be https', () => {
    expect(casting.applicationProblem({})).toMatch(/self-tape link or a cover note/);
    expect(casting.applicationProblem({ selfTapeUrl: 'youtu.be/x' })).toMatch(/https/);
    expect(casting.applicationProblem({ selfTapeUrl: 'javascript:alert(1)' })).toMatch(/https/);
    expect(casting.applicationProblem({ selfTapeUrl: 'https://youtu.be/abc' })).toBeNull();
    expect(casting.applicationProblem({ coverNote: 'Hello' })).toBeNull();
  });
});

describe('Casting & Gigs on the Talent tab', () => {
  const navigation = { navigate: jest.fn() };
  let inserted;
  beforeEach(() => {
    jest.clearAllMocks();
    mockHub = { stage: 'ready', userId: 'user-me' };
    inserted = [];
    // A small stand-in for the two tables.
    mockFrom.mockImplementation((table) => {
      const q = {
        select: () => q,
        eq: (col, v) => {
          q.filter = { col, v };
          return q;
        },
        order: () => q,
        then: (resolve) => {
          if (table === 'casting_calls') return resolve({ data: q.filter?.col === 'producer_id' ? [] : [ORIGINAL, GIG], error: null });
          return resolve({ data: [], error: null });
        },
        insert: async (row) => {
          inserted.push({ table, row });
          return { error: null };
        },
      };
      return q;
    });
  });

  async function show() {
    const CastingBoard = require('../src/components/casting/CastingBoard').default;
    await render(
      <NavigationContainer>
        <CastingBoard navigation={navigation} />
      </NavigationContainer>,
    );
    await act(async () => {});
  }

  test('BOA Originals get the cinematic badge and no budget; gigs get the gold BOA VERIFIED badge and their pay', async () => {
    await show();
    expect(screen.getByText('BOA ORIGINAL PRODUCTION')).toBeOnTheScreen();
    expect(screen.getByText('Mind States UK: Series Casting')).toBeOnTheScreen();
    expect(screen.getByText('£1,000+ BOA VERIFIED')).toBeOnTheScreen();
    expect(screen.getByText('£2,500')).toBeOnTheScreen();
    // Exactly one budget on the board: the gig's.
    expect(screen.queryAllByText(/^£[\d,.]+$/)).toHaveLength(1);
  });

  test('Apply sends a self-tape link and note as you, and the card then says Applied', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
    await show();
    await user.press(screen.getAllByText('Apply')[0]);
    await user.type(screen.getByTestId('apply-tape'), 'https://youtu.be/my-tape');
    await user.type(screen.getByTestId('apply-note'), 'Born and raised in NW London.');
    await user.press(screen.getByText('Send application'));
    await act(async () => {});
    expect(inserted).toEqual([
      {
        table: 'applications',
        row: { casting_call_id: ORIGINAL.id, user_id: 'user-me', self_tape_url: 'https://youtu.be/my-tape', cover_note: 'Born and raised in NW London.' },
      },
    ]);
    expect(screen.getByTestId('casting-applied')).toBeOnTheScreen();
  });

  test('posting a gig under £1,000 shows the premium-standard message and sends nothing', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
    await show();
    await user.press(screen.getByText('Post a gig'));
    await user.type(screen.getByTestId('post-title'), 'Dancer for a video');
    await user.press(screen.getByTestId('post-role-dancer'));
    await user.type(screen.getByTestId('post-budget'), '999');
    await user.type(screen.getByTestId('post-location'), 'Birmingham');
    await user.type(screen.getByTestId('post-description'), 'Two days on set, choreographed routine.');
    await user.press(screen.getByText('Send to BOA for review'));
    expect(screen.getByTestId('post-error')).toHaveTextContent('BOA maintains a premium standard. Minimum budget is £1,000.');
    expect(inserted).toEqual([]);
  });

  test('signed out, Apply asks you to join the Hub first', async () => {
    mockHub = { stage: 'signedOut', userId: null };
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
    await show();
    await user.press(screen.getAllByText('Apply')[0]);
    await user.press(screen.getByText('Join the Hub to apply'));
    expect(navigation.navigate).toHaveBeenCalledWith('HubWelcome', { next: 'back' });
  });
});

describe('the migration', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261025090000_casting_board_and_admin.sql'), 'utf8');
  test('enforces the minimum in the database, seeds Mind States UK as a BOA Original, and lists the admin there', () => {
    expect(sql).toContain('check (is_boa_original or (budget_amount is not null and budget_amount >= 1000))');
    expect(sql).toMatch(/'Mind States UK: Series Casting'[\s\S]*?true,\s*'London, United Kingdom',\s*true/);
    expect(sql).toContain("insert into public.admin_users (email) values ('ayychop@gmail.com')");
    expect(sql).toContain('add column if not exists is_boa_star boolean not null default false');
  });

  test('the admin email is never in the app itself', () => {
    const files = [];
    const walk = (dir) =>
      fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(js|jsx|ts|tsx|json)$/.test(e.name)) files.push(p);
      });
    walk(path.join(__dirname, '..', 'src'));
    walk(path.join(__dirname, '..', 'modules'));
    files.push(path.join(__dirname, '..', 'App.js'));
    expect(files.filter((f) => fs.readFileSync(f, 'utf8').includes('ayychop'))).toEqual([]);
  });
});
