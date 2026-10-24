import { supabase } from '../lib/supabase';
import { CALL_FIELDS } from './casting';

// The Admin Portal's calls. Every one is refused by the database unless the
// signed-in account is a BOA admin (public.is_admin(), in
// supabase/migrations/20261025090000_casting_board_and_admin.sql), so the
// app's own admin check only decides what to show.

const USER_FIELDS = 'id, username, display_name, avatar_url, roles, is_boa_star, is_featured, banned_at, visible_on_hub, created_at';

function need() {
  if (!supabase) throw new Error('The Hub is not connected yet.');
  return supabase;
}

function check({ data, error }) {
  if (error) throw new Error(error.message || 'Something went wrong');
  return data;
}

// ------------------------------------------------------------- moderation

/** Reports, open ones first, with who reported whom. */
export async function listReports() {
  return check(
    await need()
      .from('reports')
      .select(
        'id, reason, details, message_excerpt, status, created_at, reporter:reporter_id (id, username, display_name), reported:reported_user_id (id, username, display_name, banned_at)',
      )
      .order('status', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(200),
  );
}

/** 'reviewing', 'actioned' or 'dismissed'. */
export async function setReportStatus(id, status) {
  check(await need().from('reports').update({ status }).eq('id', id));
}

/** Bans (or lifts the ban on) an account. */
export async function setBanned(userId, banned) {
  check(await need().from('profiles').update({ banned_at: banned ? new Date().toISOString() : null }).eq('id', userId));
}

// --------------------------------------------------------- casting manager

/** Every call, awaiting review first. */
export async function listAllCalls() {
  return check(
    await need().from('casting_calls').select(CALL_FIELDS).order('approved', { ascending: true }).order('created_at', { ascending: false }),
  );
}

export async function setCallApproved(id, approved) {
  check(await need().from('casting_calls').update({ approved }).eq('id', id));
}

/** Edits a call's wording (title, description, role, location, open or closed). */
export async function updateCall(id, patch) {
  const allowed = ['title', 'description', 'role_needed', 'location', 'is_open', 'budget_amount'];
  const fields = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
  check(await need().from('casting_calls').update(fields).eq('id', id));
}

export async function deleteCall(id) {
  check(await need().from('casting_calls').delete().eq('id', id));
}

// ------------------------------------------------- verification and pulse

/** Members, newest first, or matching a name. */
export async function listUsers(query = '') {
  let q = need().from('profiles').select(USER_FIELDS).order('created_at', { ascending: false }).limit(100);
  const term = query.trim().replace(/[%,()]/g, '');
  if (term) q = q.or(`username.ilike.%${term}%,display_name.ilike.%${term}%`);
  return check(await q);
}

/** Badges a member as a BOA Star (or takes it away). */
export async function setBoaStar(userId, star) {
  check(await need().from('profiles').update({ is_boa_star: star }).eq('id', userId));
}

/** Featured in the Chat Hub's Community Pulse. */
export async function setFeatured(userId, featured) {
  check(await need().from('profiles').update({ is_featured: featured }).eq('id', userId));
}
