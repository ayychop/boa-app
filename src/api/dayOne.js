import { check, need } from './posts';

// Day One: the first 1,000 people to play a station or watch a BOA
// Original are its Day Ones. The database stamps each place
// (claim_day_one), so the order can't be faked from the app.

export const DAY_ONE_LIMIT = 1000;

/**
 * Records that you've played this (once per station or Original; later
 * calls return the place you already have). Returns { rank, day_one, new }.
 */
export async function claimDayOne(kind, itemId, label = '') {
  return check(await need().rpc('claim_day_one', { k: kind, item: String(itemId), label: String(label || '').slice(0, 120) }));
}

/** Someone's Day One badges, earliest first. Empty if the database is behind. */
export async function listDayOnes(userId) {
  const { data, error } = await need()
    .from('day_one_claims')
    .select('kind, item_id, item_label, rank, first_at')
    .eq('user_id', userId)
    .lte('rank', DAY_ONE_LIMIT)
    .order('first_at', { ascending: true });
  return error ? [] : data ?? [];
}

// Who has at least one badge, cached for the session so chat rows don't
// ask again on every render.
const known = new Map(); // user id -> boolean

/** The ids (of these) that hold at least one Day One badge. */
export async function dayOneHolders(ids) {
  const want = [...new Set(ids.filter(Boolean))];
  const ask = want.filter((id) => !known.has(id));
  if (ask.length) {
    const { data, error } = await need().from('day_one_claims').select('user_id').in('user_id', ask.slice(0, 100)).lte('rank', DAY_ONE_LIMIT);
    if (!error) {
      const yes = new Set((data ?? []).map((r) => r.user_id));
      ask.forEach((id) => known.set(id, yes.has(id)));
    }
  }
  return new Set(want.filter((id) => known.get(id)));
}

/** Forgets the cache (a new badge of your own, or the tests). */
export function forgetDayOnes(id) {
  if (id) known.delete(id);
  else known.clear();
}

/** "#12 of the first 1,000" */
export const placeLine = (rank) => `#${Number(rank).toLocaleString('en-GB')} of the first ${DAY_ONE_LIMIT.toLocaleString('en-GB')}`;
