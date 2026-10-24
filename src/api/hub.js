import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';

// The Creative Hub's calls to the BOA HUB Supabase project. Access rules
// live in the database (supabase/migrations); these are thin wrappers that
// throw a readable Error on failure.

export const TERMS_VERSION = '2026-10-24';
export const MIN_AGE = 18;
export const PAGE_SIZE = 20;

export const ROLES = [
  { id: 'actor', label: 'Actor' },
  { id: 'director', label: 'Director' },
  { id: 'writer', label: 'Writer' },
  { id: 'producer', label: 'Producer' },
  { id: 'cinematographer', label: 'Cinematographer' },
  { id: 'editor', label: 'Editor' },
  { id: 'musician', label: 'Musician' },
  { id: 'singer', label: 'Singer' },
  { id: 'music_producer', label: 'Music producer' },
  { id: 'dj', label: 'DJ' },
  { id: 'sound', label: 'Sound' },
  { id: 'makeup', label: 'Make-up' },
  { id: 'stylist', label: 'Stylist' },
  { id: 'photographer', label: 'Photographer' },
  { id: 'dancer', label: 'Dancer' },
  { id: 'presenter', label: 'Presenter' },
  { id: 'model', label: 'Model' },
  { id: 'crew', label: 'Crew' },
];
export const roleLabel = (id) => ROLES.find((r) => r.id === id)?.label ?? id;

export const REPORT_REASONS = [
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'hate', label: 'Hate speech' },
  { id: 'sexual', label: 'Sexual content' },
  { id: 'scam', label: 'Scam or fraud' },
  { id: 'spam', label: 'Spam' },
  { id: 'impersonation', label: 'Pretending to be someone else' },
  { id: 'underage', label: 'May be under 18' },
  { id: 'other', label: 'Something else' },
];

export const USERNAME = /^[a-z0-9_.]{3,24}$/;

/** Whole years between a date of birth and today. */
export function ageOn(dob, today = new Date()) {
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age;
}

function need() {
  if (!supabase) throw new Error('The Creative Hub is not connected yet.');
  return supabase;
}

function check({ data, error }) {
  if (error) throw new Error(error.message || 'Something went wrong');
  return data;
}

// ------------------------------------------------------------------- auth

export const authRedirect = () => Linking.createURL('auth-callback');

export async function signInWithEmail(email, password) {
  return check(await need().auth.signInWithPassword({ email: email.trim(), password }));
}

export async function signUpWithEmail(email, password) {
  return check(await need().auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: authRedirect() } }));
}

/**
 * Google, through the system browser: Supabase's OAuth page comes back to
 * boa://auth-callback with a code, exchanged here for a session (PKCE).
 */
export async function signInWithGoogle() {
  const sb = need();
  const redirectTo = authRedirect();
  const { url } = check(await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } }));
  const result = await WebBrowser.openAuthSessionAsync(url, redirectTo);
  if (result.type !== 'success') return null;
  const params = new URL(result.url.replace('#', '?')).searchParams;
  const code = params.get('code');
  if (code) return check(await sb.auth.exchangeCodeForSession(code));
  const error = params.get('error_description');
  if (error) throw new Error(error);
  return null;
}

export async function signOut() {
  await need().auth.signOut();
}

// --------------------------------------------------------------- profiles

const PROFILE_FIELDS =
  'id, username, display_name, avatar_url, bio, roles, visible_on_hub, open_for_work, status_kind, status_text, status_updated_at, last_seen_at, created_at';

export async function getProfile(id) {
  return check(await need().from('profiles').select(PROFILE_FIELDS).eq('id', id).maybeSingle());
}

export async function isUsernameFree(username, myId) {
  const rows = check(await need().from('profiles').select('id').eq('username', username.toLowerCase()).limit(1));
  return !rows.length || rows[0].id === myId;
}

export async function createProfile(userId, fields) {
  const now = new Date().toISOString();
  return check(
    await need()
      .from('profiles')
      .insert({
        id: userId,
        ...fields,
        username: fields.username.toLowerCase(),
        adult_confirmed_at: now,
        terms_accepted_at: now,
        terms_version: TERMS_VERSION,
      })
      .select(PROFILE_FIELDS)
      .single(),
  );
}

export async function updateProfile(userId, patch) {
  const fields = { ...patch };
  if (fields.username) fields.username = fields.username.toLowerCase();
  return check(await need().from('profiles').update(fields).eq('id', userId).select(PROFILE_FIELDS).single());
}

/** Uploads a picked photo to avatars/<user id>/ and returns its public URL. */
export async function uploadAvatar(userId, asset) {
  const sb = need();
  const type = asset.mimeType || 'image/jpeg';
  const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const body = await (await fetch(asset.uri)).arrayBuffer();
  check(await sb.storage.from('avatars').upload(path, body, { contentType: type, upsert: true }));
  // Old pictures go, so only the current one is kept.
  const listed = (await sb.storage.from('avatars').list(userId)).data ?? [];
  const old = listed.map((f) => `${userId}/${f.name}`).filter((p) => p !== path);
  if (old.length) await sb.storage.from('avatars').remove(old);
  return sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

/**
 * The directory: profiles visible on the Hub, people open for work first,
 * then the most recently active. `page` is 0-based; returns { rows, more }.
 */
export async function searchProfiles({ role = null, query = '', openOnly = false, page = 0, excludeId } = {}) {
  let q = need()
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('visible_on_hub', true)
    .order('open_for_work', { ascending: false })
    .order('last_seen_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  if (role) q = q.contains('roles', [role]);
  if (openOnly) q = q.eq('open_for_work', true);
  if (excludeId) q = q.neq('id', excludeId);
  const term = query.trim().replace(/[%,()]/g, '');
  if (term) q = q.or(`username.ilike.%${term}%,display_name.ilike.%${term}%`);
  const rows = check(await q);
  // One extra row was asked for, to know whether there's another page.
  return { rows: rows.slice(0, PAGE_SIZE), more: rows.length > PAGE_SIZE };
}

// ---------------------------------------------------------- block, report

export async function blockUser(myId, otherId) {
  check(await need().from('blocks').upsert({ blocker_id: myId, blocked_id: otherId }, { onConflict: 'blocker_id,blocked_id' }));
}

export async function unblockUser(myId, otherId) {
  check(await need().from('blocks').delete().eq('blocker_id', myId).eq('blocked_id', otherId));
}

export async function listBlocked(myId) {
  return check(await need().from('blocks').select('blocked_id').eq('blocker_id', myId)).map((r) => r.blocked_id);
}

export async function report({ userId = null, message = null, reason, details = '' }) {
  check(
    await need()
      .from('reports')
      .insert({
        reported_user_id: userId ?? message?.sender_id ?? null,
        message_id: message?.id ?? null,
        message_excerpt: message?.body?.slice(0, 2000) ?? null,
        reason,
        details: details.trim() || null,
      }),
  );
}

// ------------------------------------------------------------------ chats

/** Your threads, latest first, each with the other person's profile. */
export async function listConversations(myId) {
  const rows = check(
    await need()
      .from('conversations')
      .select('*')
      .or(`user_a.eq.${myId},user_b.eq.${myId}`)
      .not('last_message_at', 'is', null)
      .order('last_message_at', { ascending: false })
      .limit(100),
  );
  const otherIds = [...new Set(rows.map((c) => (c.user_a === myId ? c.user_b : c.user_a)))];
  const profiles = otherIds.length ? check(await need().from('profiles').select(PROFILE_FIELDS).in('id', otherIds)) : [];
  const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));
  return rows.map((c) => shapeConversation(c, myId, byId));
}

export function shapeConversation(c, myId, byId = {}) {
  const mine = c.user_a === myId ? 'a' : 'b';
  const otherId = mine === 'a' ? c.user_b : c.user_a;
  const myRead = c[`${mine}_last_read_at`];
  const theirRead = c[`${mine === 'a' ? 'b' : 'a'}_last_read_at`];
  return {
    ...c,
    otherId,
    other: byId[otherId] ?? null,
    theirReadAt: theirRead,
    unread: !!c.last_message_at && c.last_sender_id !== myId && (!myRead || new Date(myRead) < new Date(c.last_message_at)),
  };
}

export async function startConversation(otherId) {
  return check(await need().rpc('start_conversation', { other: otherId }));
}

export async function getConversation(id, myId) {
  const c = check(await need().from('conversations').select('*').eq('id', id).single());
  const otherId = c.user_a === myId ? c.user_b : c.user_a;
  const other = await getProfile(otherId).catch(() => null);
  return shapeConversation(c, myId, { [otherId]: other });
}

/** A page of messages, newest first; `before` is an ISO time for older pages. */
export async function listMessages(conversationId, before = null, limit = 40) {
  let q = need().from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(limit);
  if (before) q = q.lt('created_at', before);
  return check(await q);
}

export async function sendMessage(conversationId, body) {
  return check(await need().from('messages').insert({ conversation_id: conversationId, body: body.trim() }).select('*').single());
}

/** Removes one of your own messages, for both people. */
export async function deleteMessage(id) {
  check(await need().from('messages').delete().eq('id', id));
}

export async function markRead(conversationId) {
  check(await need().rpc('mark_read', { conv: conversationId }));
}

// ------------------------------------------------------------------- GDPR

export async function exportMyData() {
  return check(await need().rpc('export_my_data'));
}

/** Removes the avatar files, then the account and everything that cascades from it. */
export async function deleteMyAccount(userId) {
  const sb = need();
  const files = (await sb.storage.from('avatars').list(userId)).data ?? [];
  if (files.length) await sb.storage.from('avatars').remove(files.map((f) => `${userId}/${f.name}`));
  check(await sb.rpc('delete_my_account'));
  await sb.auth.signOut().catch(() => {});
}
