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

// Where Supabase sends you back from the confirmation email: the app's own
// scheme (app.json). It must be in Supabase's Redirect URLs
// (network.boa://**). The app routes it to completeAuthLink (App.js).
export const AUTH_REDIRECT = 'network.boa://auth-callback';
export const authRedirect = () => AUTH_REDIRECT;

export const EXISTING_EMAIL = 'An account with this email already exists. Sign in instead.';

/** An Error with a code the screen can act on (e.g. offer to resend the email). */
function authError(code, message) {
  return Object.assign(new Error(message), { code });
}

/**
 * Signs in with email and password. Unconfirmed accounts get
 * code 'email_not_confirmed', so the screen can offer to resend the link.
 */
export async function signInWithEmail(email, password) {
  const { data, error } = await need().auth.signInWithPassword({ email: email.trim(), password });
  if (!error) return data;
  const message = error.message || '';
  if (error.code === 'email_not_confirmed' || /not confirmed/i.test(message)) {
    throw authError('email_not_confirmed', `Confirm your email first: we sent a link to ${email.trim()}.`);
  }
  if (error.code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    throw authError('invalid_credentials', "That email and password don't match an account.");
  }
  throw authError(error.code ?? null, message || 'Something went wrong');
}

/**
 * Creates an account. With "Confirm email" on, Supabase sends a link to
 * network.boa://auth-callback and there's no session until it's tapped
 * ({ session: null }). An email that's already registered: with
 * confirmation on, Supabase doesn't say so (so nobody can find out who has
 * an account) but returns a user with no identities; either way the
 * listener hears EXISTING_EMAIL.
 */
export async function signUpWithEmail(email, password) {
  const { data, error } = await need().auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: AUTH_REDIRECT } });
  if (error) {
    if (error.code === 'user_already_exists' || /already registered|already exists/i.test(error.message || '')) {
      throw authError('user_already_exists', EXISTING_EMAIL);
    }
    throw authError(error.code ?? null, error.message || 'Something went wrong');
  }
  if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw authError('user_already_exists', EXISTING_EMAIL);
  }
  return data;
}

/** Sends the confirmation email again. */
export async function resendConfirmation(email) {
  const { error } = await need().auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: AUTH_REDIRECT } });
  if (error) throw authError(error.code ?? null, error.message || "Couldn't send the email");
}

/**
 * Completes a confirmation link (network.boa://auth-callback...), in
 * whichever form Supabase sends it: ?code= (PKCE), ?token_hash=&type=, or
 * #access_token=&refresh_token=. Returns the session. A link opened on a
 * different phone (or one already used) still confirmed the email, so the
 * error says to sign in with the password.
 */
export async function completeAuthLink(url) {
  const sb = need();
  const params = new URLSearchParams([new URL(url).search, new URL(url).hash].map((p) => p.replace(/^[?#]/, '')).filter(Boolean).join('&'));
  const failed = params.get('error_description') || params.get('error');
  if (failed) throw authError(params.get('error_code') ?? 'link_error', failed.replace(/\+/g, ' '));
  try {
    if (params.get('code')) return check(await sb.auth.exchangeCodeForSession(params.get('code'))).session;
    if (params.get('token_hash')) {
      return check(await sb.auth.verifyOtp({ token_hash: params.get('token_hash'), type: params.get('type') || 'signup' })).session;
    }
    if (params.get('access_token') && params.get('refresh_token')) {
      return check(await sb.auth.setSession({ access_token: params.get('access_token'), refresh_token: params.get('refresh_token') })).session;
    }
  } catch {
    throw authError('confirmed_sign_in', 'Your email is confirmed. Sign in with your email and password.');
  }
  return null;
}

export async function signOut() {
  await need().auth.signOut();
}

// --------------------------------------------------------------- profiles

const PROFILE_FIELDS =
  'id, username, display_name, avatar_url, bio, roles, quote_category, is_boa_star, is_featured, banned_at, visible_on_hub, open_for_work, status_kind, status_text, status_updated_at, last_seen_at, created_at';

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
  const row = {
    id: userId,
    ...fields,
    username: fields.username.toLowerCase(),
    adult_confirmed_at: new Date(adultConfirmedAt).toISOString(),
    terms_accepted_at: new Date().toISOString(),
    terms_version: TERMS_VERSION,
  };
  const res = await need().from('profiles').insert(row).select(PROFILE_FIELDS).single();
  if (res.error) {
    const { code = null, message = '', details = null, hint = null } = res.error;
    // Everything needed to see why, in the device log (adb logcat, Metro):
    // the database's own error, and what was sent (columns, not contents).
    console.warn(
      '[hub] createProfile insert failed',
      JSON.stringify({ code, message, details, hint, columns: Object.keys(row), adult_confirmed_at: row.adult_confirmed_at }),
    );
    // A column the app sends that the database doesn't have (42703, or
    // PGRST204 from the API's schema cache): the database is behind the app.
    const missingColumn = code === 'PGRST204' || code === '42703' || /schema cache|does not exist/i.test(message);
    const err = new Error(
      missingColumn
        ? `The Hub's database isn't up to date, so your profile couldn't be saved. (${message})`
        : `Couldn't create your profile. ${message}`.trim(),
    );
    Object.assign(err, { code, details, hint });
    throw err;
  }
  return res.data;
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

// --------------------------------------------------------- community pulse

/** The newest people on the Hub (visible profiles), newest first. */
export async function listNewMembers({ limit = 12, excludeId } = {}) {
  let q = need().from('profiles').select(PROFILE_FIELDS).eq('visible_on_hub', true).order('created_at', { ascending: false }).limit(limit);
  if (excludeId) q = q.neq('id', excludeId);
  return check(await q);
}

/**
 * Creatives to follow: visible people who share one of your roles, open
 * for work and most recently active first. With no roles, the most active.
 */
export async function listSuggested({ roles = [], limit = 12, excludeId } = {}) {
  let q = need()
    .from('profiles')
    .select(PROFILE_FIELDS)
    .eq('visible_on_hub', true)
    .order('open_for_work', { ascending: false })
    .order('last_seen_at', { ascending: false })
    .limit(limit);
  if (roles.length) q = q.overlaps('roles', roles);
  if (excludeId) q = q.neq('id', excludeId);
  return check(await q);
}

/** People BOA's admins chose to feature in the Community Pulse. */
export async function listFeatured({ limit = 12, excludeId } = {}) {
  let q = need().from('profiles').select(PROFILE_FIELDS).eq('is_featured', true).eq('visible_on_hub', true).order('last_seen_at', { ascending: false }).limit(limit);
  if (excludeId) q = q.neq('id', excludeId);
  return check(await q);
}

/**
 * Whether you're a BOA admin. The database decides (your confirmed sign-in
 * email is in its admin list); the app never holds that list.
 */
export async function amIAdmin() {
  const { data, error } = await need().rpc('is_admin');
  if (error) return false;
  return data === true;
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

/** Whether a disappearing message has run out (the database hides it too). */
export const isExpired = (message, now = Date.now()) => !!message?.expires_at && new Date(message.expires_at).getTime() <= now;

/**
 * A page of messages, newest first; `before` is an ISO time for older
 * pages. Expired ones are left out: the database's read policy hides them,
 * and anything that ran out on the way is dropped here.
 */
export async function listMessages(conversationId, before = null, limit = 40) {
  let q = need().from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(limit);
  if (before) q = q.lt('created_at', before);
  return (check(await q) ?? []).filter((m) => m && !isExpired(m));
}

export async function sendMessage(conversationId, body) {
  return check(await need().from('messages').insert({ conversation_id: conversationId, body: body.trim() }).select('*').single());
}

/** Removes one of your own messages, for both people (and its file, if it had one). */
export async function deleteMessage(id, mediaPath = null) {
  check(await need().from('messages').delete().eq('id', id));
  if (mediaPath) await need().storage.from(CHAT_BUCKET).remove([mediaPath]).catch(() => {});
}

// ------------------------------------------------------------- chat media

// WhatsApp's limits: photos up to 16 MB, videos up to 64 MB. The bucket
// (supabase/migrations) holds files to 64 MB.
export const CHAT_BUCKET = 'chat-media';
export const MEDIA_LIMITS = { image: 16 * 1024 * 1024, video: 64 * 1024 * 1024, voice: 16 * 1024 * 1024 };
export const MEDIA_QUALITY = 0.8;
const MEDIA_UPLOAD_TIMEOUT_MS = 180000;
const SIGNED_URL_SECONDS = 60 * 60;

const mb = (bytes) => `${Math.round(bytes / (1024 * 1024))} MB`;

/** 'image' | 'video' for a picked asset. */
export const mediaKind = (asset) => (asset?.type === 'video' || /^video\//.test(asset?.mimeType ?? '') ? 'video' : 'image');

/** Whether a picked photo or video can be sent: null if so, else why not. */
export function mediaProblem(asset) {
  if (!asset?.uri) return 'That file could not be opened.';
  const kind = mediaKind(asset);
  if (asset.fileSize && asset.fileSize > MEDIA_LIMITS[kind]) {
    return kind === 'video'
      ? `That video is over ${mb(MEDIA_LIMITS.video)}. Trim it or choose a shorter one.`
      : `That photo is over ${mb(MEDIA_LIMITS.image)}. Choose a smaller one.`;
  }
  return null;
}

const EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/3gpp': '3gp',
  'video/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/webm': 'webm',
};

/**
 * Uploads a photo, video or voice note to chat-media/<conversation>/<you>/
 * and returns its storage path. Throws a readable Error (too large, no
 * connection, timed out).
 */
export async function uploadChatMedia(conversationId, userId, { uri, mimeType, kind }) {
  const sb = need();
  const limit = MEDIA_LIMITS[kind] ?? MEDIA_LIMITS.image;
  const type = mimeType || (kind === 'video' ? 'video/mp4' : kind === 'voice' ? 'audio/mp4' : 'image/jpeg');
  const path = `${conversationId}/${userId}/${kind}-${Date.now()}.${EXT[type] ?? 'bin'}`;
  let body;
  try {
    body = await (await fetch(uri)).arrayBuffer();
  } catch {
    throw new Error('That file could not be read from your phone.');
  }
  if (body.byteLength > limit) throw new Error(`That file is over ${mb(limit)}.`);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('The upload timed out. Check your connection and try again.')), MEDIA_UPLOAD_TIMEOUT_MS);
  });
  try {
    const res = await Promise.race([sb.storage.from(CHAT_BUCKET).upload(path, body, { contentType: type, upsert: false }), timeout]);
    if (res?.error) {
      const msg = res.error.message || '';
      if (/size|large|413/i.test(msg)) throw new Error(`That file is too large to send (over the server's limit).`);
      if (/network|fetch|timed? ?out/i.test(msg)) throw new Error("Couldn't send: no connection. Try again in a moment.");
      throw new Error(`Couldn't upload. ${msg}`.trim());
    }
  } catch (err) {
    if (/Network request failed|Failed to fetch/i.test(err?.message || '')) throw new Error("Couldn't send: no connection. Try again in a moment.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
  return { path, size: body.byteLength, mime: type };
}

/** Saves a media message (after uploadChatMedia). */
export async function sendMedia(conversationId, { kind, path, mime, size, width = null, height = null, durationMs = null, waveform = null, caption = '' }) {
  return check(
    await need()
      .from('messages')
      .insert({
        conversation_id: conversationId,
        kind,
        body: caption.trim(),
        media_path: path,
        media_mime: mime,
        media_size: size,
        media_width: width ? Math.round(width) : null,
        media_height: height ? Math.round(height) : null,
        media_duration_ms: durationMs ? Math.round(durationMs) : null,
        waveform,
      })
      .select('*')
      .single(),
  );
}

// Signed links last an hour; they're reused until ten minutes before then.
const signed = new Map(); // path -> { url, until }

/** A short-lived link to a chat file (chat-media is private). */
export async function mediaUrl(path) {
  const hit = signed.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const { data, error } = await need().storage.from(CHAT_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) throw new Error(error?.message || "Couldn't load that file");
  signed.set(path, { url: data.signedUrl, until: Date.now() + (SIGNED_URL_SECONDS - 600) * 1000 });
  return data.signedUrl;
}

/** Whether your messages disappear after 24 hours (false if the database doesn't have the setting yet). */
export async function getDisappearing(userId) {
  const { data, error } = await need().from('profiles').select('disappearing_messages').eq('id', userId).maybeSingle();
  return !error && data?.disappearing_messages === true;
}

export async function setDisappearing(userId, on) {
  const { error } = await need().from('profiles').update({ disappearing_messages: !!on }).eq('id', userId);
  if (error) {
    if (error.code === 'PGRST204' || error.code === '42703') throw new Error("The Hub's database isn't up to date yet, so this can't be turned on.");
    throw new Error(error.message || "Couldn't save");
  }
}

// ------------------------------------------------------- push notifications

/** Registers this phone for new-message pushes, with its chosen sound. */
export async function savePushToken(token, platform, sound) {
  check(await need().rpc('claim_push_token', { t: token, plat: platform, snd: sound }));
}

/** Stops pushes to this phone (signing out). */
export async function removePushToken(token) {
  check(await need().from('push_tokens').delete().eq('token', token));
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
