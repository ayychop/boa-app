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

const LINK_GRACE_MS = 800;

// On the web the sign-in popup closes itself through this.
WebBrowser.maybeCompleteAuthSession();

/** Finishes an OAuth return (network.boa://auth-callback?code=...): a session, or null. */
async function completeOAuth(sb, returnUrl) {
  const params = new URL(returnUrl.replace('#', '?')).searchParams;
  const code = params.get('code');
  if (code) return check(await sb.auth.exchangeCodeForSession(code));
  const error = params.get('error_description') || params.get('error');
  if (error) throw new Error(error);
  return null;
}

/**
 * Google, through the system browser: Supabase's OAuth page comes back to
 * network.boa://auth-callback with a code, exchanged here for a session (PKCE).
 * Some Android browsers hand the redirect to the app as an ordinary link
 * and report the browser as dismissed, so the link is caught here too.
 */
export async function signInWithGoogle() {
  const sb = need();
  const redirectTo = authRedirect();
  const { url } = check(await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } }));
  let linked = null;
  const sub = Linking.addEventListener('url', (e) => {
    if (e?.url?.startsWith(redirectTo)) linked = e.url;
  });
  try {
    const result = await WebBrowser.openAuthSessionAsync(url, redirectTo);
    // The link can land a moment after the browser reports it closed.
    if (result.type !== 'success' && !linked) await new Promise((r) => setTimeout(r, LINK_GRACE_MS));
    const returned = result.type === 'success' ? result.url : linked;
    return returned ? await completeOAuth(sb, returned) : null;
  } finally {
    sub?.remove?.();
  }
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

/**
 * Creates your Hub profile. `adultConfirmedAt` is when you ticked "I am 18
 * or over" (an ISO timestamp); it's required, and stored with the terms you
 * agreed to.
 */
export async function createProfile(userId, fields, { adultConfirmedAt } = {}) {
  if (!adultConfirmedAt || Number.isNaN(Date.parse(adultConfirmedAt))) {
    throw new Error('Please confirm you are 18 or over.');
  }
  const res = await need()
    .from('profiles')
    .insert({
      id: userId,
      ...fields,
      username: fields.username.toLowerCase(),
      adult_confirmed_at: new Date(adultConfirmedAt).toISOString(),
      terms_accepted_at: new Date().toISOString(),
      terms_version: TERMS_VERSION,
    })
    .select(PROFILE_FIELDS)
    .single();
  // The database still updating after a change to its tables.
  if (res.error && /schema cache/i.test(res.error.message || '')) {
    throw new Error("The Hub is finishing an update. Please try again in a minute.");
  }
  return check(res);
}

export async function updateProfile(userId, patch) {
  const fields = { ...patch };
  if (fields.username) fields.username = fields.username.toLowerCase();
  return check(await need().from('profiles').update(fields).eq('id', userId).select(PROFILE_FIELDS).single());
}

// The avatars bucket's own limits (supabase/migrations).
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const UPLOAD_TIMEOUT_MS = 30000;

/** Whether a picked photo can be uploaded: null if so, else why not. */
export function avatarProblem(asset) {
  if (!asset?.uri) return 'That photo could not be opened.';
  if (asset.fileSize && asset.fileSize > MAX_AVATAR_BYTES) return 'That photo is over 5 MB. Choose a smaller one.';
  if (asset.mimeType && !AVATAR_TYPES.includes(asset.mimeType)) return 'Use a JPEG, PNG or WebP photo.';
  return null;
}

/**
 * Uploads a picked photo to avatars/<user id>/ and returns its public URL.
 * Throws an Error with a readable message (too large, no connection, timed
 * out) rather than anything raw.
 */
export async function uploadAvatar(userId, asset) {
  const sb = need();
  const problem = avatarProblem(asset);
  if (problem) throw new Error(problem);
  const type = asset.mimeType || 'image/jpeg';
  const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  let body;
  try {
    body = await (await fetch(asset.uri)).arrayBuffer();
  } catch {
    throw new Error('That photo could not be read from your phone.');
  }
  if (body.byteLength > MAX_AVATAR_BYTES) throw new Error('That photo is over 5 MB. Choose a smaller one.');
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('The upload timed out. Check your connection and try again.')), UPLOAD_TIMEOUT_MS);
  });
  try {
    const res = await Promise.race([sb.storage.from('avatars').upload(path, body, { contentType: type, upsert: true }), timeout]);
    if (res?.error) {
      const msg = res.error.message || '';
      if (/size|large|413/i.test(msg)) throw new Error('That photo is over 5 MB. Choose a smaller one.');
      if (/network|fetch|timed? ?out/i.test(msg)) throw new Error("Couldn't upload: no connection. Try again in a moment.");
      throw new Error(`Couldn't upload the photo. ${msg}`.trim());
    }
  } catch (err) {
    if (/Network request failed|Failed to fetch/i.test(err?.message || '')) throw new Error("Couldn't upload: no connection. Try again in a moment.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
  // Old pictures go, so only the current one is kept. Best effort: a
  // failure here never undoes the new photo.
  try {
    const listed = (await sb.storage.from('avatars').list(userId)).data ?? [];
    const old = listed.map((f) => `${userId}/${f.name}`).filter((p) => p !== path);
    if (old.length) await sb.storage.from('avatars').remove(old);
  } catch {}
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
