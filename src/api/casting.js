import { supabase } from '../lib/supabase';

// The Casting Board: curated, paid casting calls and gigs, and applications
// to them (supabase/migrations/20261025090000_casting_board_and_admin.sql).
// A member's gig goes live once a BOA admin approves it. The
// database enforces every rule here too; these checks are so the listener
// hears why at once, in BOA's words.

export const MIN_EXTERNAL_BUDGET = 1000;
export const BUDGET_MESSAGE = 'BOA maintains a premium standard. Minimum budget is £1,000.';

export const CALL_FIELDS = 'id, producer_id, title, description, role_needed, budget_amount, is_boa_original, location, is_open, approved, created_at';

function need() {
  if (!supabase) throw new Error('The Casting Board is not connected yet.');
  return supabase;
}

/** "£2,500" (whole pounds), or "£1,250.50". */
export function formatBudget(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/**
 * The budget rule: BOA Originals skip it; external gigs need £1,000 or
 * more. Returns null when fine, else the message to show.
 */
export function budgetProblem({ isBoaOriginal, budget }) {
  if (isBoaOriginal) return null;
  const n = typeof budget === 'string' ? Number(budget.replace(/[£,\s]/g, '')) : Number(budget);
  if (!Number.isFinite(n) || n < MIN_EXTERNAL_BUDGET) return BUDGET_MESSAGE;
  return null;
}

/** Reads "£2,500", "2500", "2,500.50" as a number of pounds, or NaN. */
export const parseBudget = (text) => Number(String(text ?? '').replace(/[£,\s]/g, '') || NaN);

/** Live calls (open and approved): BOA Originals first, then the newest gigs. */
export async function listCastingCalls() {
  const { data, error } = await need()
    .from('casting_calls')
    .select(CALL_FIELDS)
    .eq('is_open', true)
    .eq('approved', true)
    .order('is_boa_original', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** The calls you've applied to: { [casting_call_id]: status }. */
export async function myApplications(userId) {
  if (!userId) return {};
  const { data, error } = await need().from('applications').select('casting_call_id, status').eq('user_id', userId);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((a) => [a.casting_call_id, a.status]));
}

const HTTPS = /^https:\/\/[^\s]+\.[^\s]+$/i;

/** Your own gigs, approved or awaiting review, newest first. */
export async function myCalls(userId) {
  if (!userId) return [];
  const { data, error } = await need().from('casting_calls').select(CALL_FIELDS).eq('producer_id', userId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Null when an application can be sent, else what's missing or wrong. */
export function applicationProblem({ selfTapeUrl, coverNote }) {
  const url = (selfTapeUrl ?? '').trim();
  const note = (coverNote ?? '').trim();
  if (!url && !note) return 'Add a self-tape link or a cover note.';
  if (url && !HTTPS.test(url)) return 'The self-tape link needs to be a full https:// address (YouTube, Vimeo, Drive...).';
  if (note.length > 1500) return 'Keep the cover note under 1,500 characters.';
  return null;
}

/** Applies to a call as you, with a self-tape link and/or a cover note. */
export async function apply({ castingCallId, userId, selfTapeUrl, coverNote }) {
  const problem = applicationProblem({ selfTapeUrl, coverNote });
  if (problem) throw new Error(problem);
  const { error } = await need()
    .from('applications')
    .insert({
      casting_call_id: castingCallId,
      user_id: userId,
      self_tape_url: selfTapeUrl?.trim() || null,
      cover_note: coverNote?.trim() || null,
    });
  if (error) {
    if (error.code === '23505' || /applications_once|duplicate/i.test(error.message)) throw new Error("You've already applied for this one.");
    throw new Error(`Couldn't send your application. ${error.message}`);
  }
}

/**
 * Posts an external gig as you. Members can't post BOA Originals; the
 * budget must be £1,000 or more. It goes live once a BOA admin approves it.
 */
export async function postCastingCall({ producerId, title, description, roleNeeded, budget, location }) {
  const amount = parseBudget(budget);
  const problem = budgetProblem({ isBoaOriginal: false, budget: amount });
  if (problem) throw new Error(problem);
  const { data, error } = await need()
    .from('casting_calls')
    .insert({
      producer_id: producerId,
      title: title.trim(),
      description: description.trim(),
      role_needed: roleNeeded,
      budget_amount: amount,
      is_boa_original: false,
      location: location.trim(),
    })
    .select(CALL_FIELDS)
    .single();
  if (error) {
    // The database's own budget check, in BOA's words. (Any other refusal,
    // such as a lapsed sign-in, says what it is.)
    if (/casting_calls_budget_minimum/i.test(error.message)) throw new Error(BUDGET_MESSAGE);
    throw new Error(`Couldn't post the gig. ${error.message}`);
  }
  return data;
}
