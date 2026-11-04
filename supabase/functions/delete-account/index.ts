// BOA HUB: a member deletes their own account, for good.
//
//   POST /delete-account   { "confirm": "DELETE" }
//   Authorization: Bearer <the member's own session token>
//   -> { "deleted": true, "files": <count> }
//
// This is what the app's Settings, Delete account button calls, and what the
// web deletion page (https://www.boanetworks.com/delete-account) calls. The
// page signs the member in with Supabase Auth (the same email and password as
// the app) and posts their session token here; there is no other way in, so
// nobody can delete an account that is not theirs.
//
// It erases, in this order:
//   1. their files: avatar, posts, block evidence, and every file in the
//      conversations they are part of (the conversation goes, so its media
//      goes with it);
//   2. their admin entry, if they had one (admins are listed by email);
//   3. their sign-in account (auth.users). The database does the rest:
//      profiles references auth.users on delete cascade, and posts, messages
//      and conversations (their whole chat history, both sides), blocks,
//      hearts, reports they filed, casting calls, applications, push tokens,
//      split sheets, invoices and the rest reference profiles on delete
//      cascade (supabase/migrations/20261027090000_delete_user_cascade.sql);
//   4. a check that their profile row is really gone, deleted by hand if not.
//
// What is kept, on purpose: a report someone else filed about them stays so
// moderators can still act on it, with the person removed (reported_user_id
// becomes null), and moderation_events keeps categories only, no person.
//
// Protection: the caller's session is verified here, nothing can be deleted
// without the exact word DELETE, and attempts are rate limited per account
// and per address (public.edge_rate_limit). CORS only allows the BOA site.
//
// Deploy: supabase functions deploy delete-account
// (Keep JWT verification on. Optional: supabase secrets set
//  ACCOUNT_DELETION_ORIGINS="https://other.example" for extra web origins.)

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { clientIp, hit, memoryLimiter } from '../_shared/rateLimit.ts';
import { corsHeaders } from '../_shared/safety.ts';
import { removeFolder } from '../_shared/storage.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ORIGINS = new Set([
  'https://www.boanetworks.com',
  'https://boanetworks.com',
  ...(Deno.env.get('ACCOUNT_DELETION_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
]);
const LIMITS = { userPerHour: 5, ipPerHour: 20 };

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const memory = memoryLimiter();

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('Origin'), ALLOWED_ORIGINS);
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', ...headers } });
  const refuse = (status: number, error: string, detail?: unknown, headers: Record<string, string> = {}) => {
    console.error('[delete-account]', status, error, detail ?? '');
    return json({ error }, status, headers);
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (req.method !== 'POST') return refuse(405, 'POST only');

    const ip = clientIp(req);
    const byIp = await hit(admin, memory, `delete-account:ip:${ip}`, 3600, LIMITS.ipPerHour);
    if (!byIp.allowed) return refuse(429, 'Too many attempts. Try again later.', { ip }, { 'Retry-After': String(byIp.retryAfter) });

    // Who is asking, from their own session. Nobody else's account can be named.
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return refuse(401, 'Sign in first.', 'no Authorization header');
    const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: me, error: authError } = await caller.auth.getUser();
    if (!me?.user) return refuse(401, 'Sign in first.', authError?.message);
    const userId = me.user.id;

    const byUser = await hit(admin, memory, `delete-account:user:${userId}`, 3600, LIMITS.userPerHour);
    if (!byUser.allowed) return refuse(429, 'Too many attempts. Try again later.', { userId }, { 'Retry-After': String(byUser.retryAfter) });

    let confirm = '';
    try {
      confirm = String((await req.json())?.confirm ?? '');
    } catch {
      return refuse(400, 'bad body');
    }
    if (confirm !== 'DELETE') return refuse(400, 'Type DELETE to confirm.', 'missing confirm');

    // 1. Files first: Storage is not covered by the database's cascades.
    let files = 0;
    let failed = 0;
    const tally = (r: { removed: number; failed: number }) => {
      files += r.removed;
      failed += r.failed;
    };
    const { data: convs } = await admin.from('conversations').select('id').or(`user_a.eq.${userId},user_b.eq.${userId}`);
    for (const c of convs ?? []) tally(await removeFolder(admin, 'chat-media', c.id));
    for (const bucket of ['avatars', 'posts', 'block-evidence']) tally(await removeFolder(admin, bucket, userId));
    if (failed) console.error('[delete-account] files that could not be removed', { userId, failed });

    // 2. Their admin entry, if any (admins are listed by email).
    const email = me.user.email?.toLowerCase();
    if (email) await admin.from('admin_users').delete().eq('email', email);

    // 3. The sign-in account; the database cascades the rest.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId, false);
    if (deleteError) return refuse(500, "Couldn't delete the account. Try again, or write to support.", deleteError.message);

    // 4. Make sure nothing of them is left in the Hub.
    const { data: left } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (left) {
      console.error('[delete-account] profile survived the cascade; deleting it', { userId });
      const { error } = await admin.from('profiles').delete().eq('id', userId);
      if (error) return refuse(500, "Your sign in was removed but some data is left. Write to support and we'll finish it.", error.message);
    }

    console.log('[delete-account] deleted', { userId, files });
    return json({ deleted: true, files });
  } catch (err) {
    return refuse(500, 'Account deletion failed.', err instanceof Error ? err.stack ?? err.message : String(err));
  }
});
