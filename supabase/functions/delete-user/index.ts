// Admin Portal: delete a member's account for good.
//
// The app can't delete sign-in accounts (that needs the service role key,
// which never ships in the app), so the Admin Portal calls this function
// with the signed-in admin's session:
//
//   POST /delete-user   { "userId": "<uuid>" }
//
// It checks the caller is a BOA admin (public.is_admin(), the same check
// the database uses), clears the member's files out of Storage, then
// deletes the auth user. The database does the rest: profiles references
// auth.users on delete cascade, and everything a member owns (posts,
// messages, conversations, blocks, hearts, reports they filed, casting
// calls, applications, push tokens, split sheets, invoices) references
// profiles on delete cascade. See
// supabase/migrations/20261027090000_delete_user_cascade.sql.
//
// Admins can't delete themselves or another admin here; that's done in the
// Supabase dashboard on purpose.
//
// Deploy: supabase functions deploy delete-user
// (JWT verification stays on; SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.)

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

/** Every file under a folder, however deep (Storage lists one level at a time). */
async function filesUnder(db: SupabaseClient, bucket: string, folder: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(folder, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const item of data) {
      const path = `${folder}/${item.name}`;
      // Folders come back without an id.
      if (item.id) out.push(path);
      else out.push(...(await filesUnder(db, bucket, path)));
    }
    if (data.length < 1000) break;
  }
  return out;
}

async function removeFolder(bucket: string, folder: string) {
  const paths = await filesUnder(admin, bucket, folder);
  for (let i = 0; i < paths.length; i += 100) {
    await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
  }
  return paths.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  // Who's asking, from their own session.
  const auth = req.headers.get('Authorization') ?? '';
  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: me } = await caller.auth.getUser();
  if (!me?.user) return json({ error: 'Sign in first.' }, 401);
  const { data: isAdmin } = await caller.rpc('is_admin');
  if (isAdmin !== true) return json({ error: 'Admins only.' }, 403);

  let userId: string;
  try {
    userId = String((await req.json())?.userId ?? '');
  } catch {
    return json({ error: 'bad body' }, 400);
  }
  if (!UUID.test(userId)) return json({ error: 'That account id is not valid.' }, 400);
  if (userId === me.user.id) return json({ error: "You can't delete your own account from here." }, 400);

  const { data: target, error: lookup } = await admin.auth.admin.getUserById(userId);
  if (lookup || !target?.user) return json({ error: 'That account no longer exists.' }, 404);
  const email = target.user.email?.toLowerCase();
  if (email) {
    const { data: other } = await admin.from('admin_users').select('id').eq('email', email).maybeSingle();
    if (other) return json({ error: "Another admin's account can't be deleted from the app." }, 403);
  }

  // Files first: Storage isn't covered by the database's cascades.
  // Chat media lives at <conversation id>/<sender id>/..., and the whole
  // conversation goes with this account, so all of its media goes too.
  const { data: convs } = await admin.from('conversations').select('id').or(`user_a.eq.${userId},user_b.eq.${userId}`);
  let files = 0;
  for (const c of convs ?? []) files += await removeFolder('chat-media', c.id);
  for (const bucket of ['avatars', 'posts', 'block-evidence']) files += await removeFolder(bucket, userId);

  const { error } = await admin.auth.admin.deleteUser(userId, false);
  if (error) return json({ error: error.message }, 500);
  return json({ deleted: userId, files });
});
