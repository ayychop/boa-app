// BOA video calls: the Agora pass for one call.
//
//   POST /agora-token   { "channel": "<call id>" }
//   -> { "appId", "token", "uid", "expiresIn" }
//
// The App Certificate signs tokens and must never ship in the app, so only
// this function knows it. It checks the caller is signed in and not
// banned, then signs a publisher token for that channel and that person's
// uid only (a fixed number derived from their account id, so the same
// person always has the same uid). Tokens last an hour; the app asks again
// when Agora says one is about to run out.
//
// Deploy:
//   supabase secrets set AGORA_APP_ID=<App ID> AGORA_APP_CERTIFICATE=<Primary Certificate>
//   supabase functions deploy agora-token
// (Agora Console, your project, "Secured mode: APP ID + Token".)

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { RtcRole, RtcTokenBuilder } from 'npm:agora-token@2.0.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_ID = Deno.env.get('AGORA_APP_ID') ?? '';
const CERTIFICATE = Deno.env.get('AGORA_APP_CERTIFICATE') ?? '';
const TTL = 3600;
// Call ids are UUIDs (src/context/CallContext.js); allow the older format too.
const CHANNEL = /^[A-Za-z0-9-]{16,64}$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

/** A stable Agora uid (1 to 2^31 - 1) from an account id. */
export function uidFor(userId: string) {
  const n = parseInt(userId.replace(/-/g, '').slice(0, 8), 16) & 0x7fffffff;
  return n || 1;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!APP_ID || !CERTIFICATE) return json({ error: 'Video calls are not set up yet.' }, 503);

  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: me } = await caller.auth.getUser();
  if (!me?.user) return json({ error: 'Sign in first.' }, 401);

  let channel: string;
  try {
    channel = String((await req.json())?.channel ?? '');
  } catch {
    return json({ error: 'bad body' }, 400);
  }
  if (!CHANNEL.test(channel)) return json({ error: 'bad channel' }, 400);

  const { data: profile } = await admin.from('profiles').select('banned_at').eq('id', me.user.id).maybeSingle();
  if (!profile || profile.banned_at) return json({ error: "This account can't make calls." }, 403);

  const uid = uidFor(me.user.id);
  const token = RtcTokenBuilder.buildTokenWithUid(APP_ID, CERTIFICATE, channel, uid, RtcRole.PUBLISHER, TTL, TTL);
  return json({ appId: APP_ID, token, uid, expiresIn: TTL });
});
