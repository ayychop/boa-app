// BOA video calls: the Agora pass for one call.
//
//   POST /agora-token   { "channel": "<call id>" }
//   -> { "appId", "token", "uid", "channel", "expiresIn" }
//
// Every refusal is JSON ({ error }) with its own status, and is logged with
// console.error, so the function's logs (Dashboard, Edge Functions,
// agora-token, Logs) say exactly why a call couldn't connect. The app shows
// the same message on the call screen (src/calls/token.js).
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
  const refuse = (status: number, error: string, detail?: unknown) => {
    console.error('[agora-token]', status, error, detail ?? '');
    return json({ error }, status);
  };
  try {
    if (req.method !== 'POST') return refuse(405, 'POST only');
    if (!APP_ID || !CERTIFICATE) return refuse(503, 'Video calls are not set up yet.', { appId: !!APP_ID, certificate: !!CERTIFICATE });

    // No auth header (or an expired session) is a clear 401, never a crash.
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return refuse(401, 'Sign in first.', 'no Authorization header');
    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: me, error: authError } = await caller.auth.getUser();
    if (!me?.user) return refuse(401, 'Sign in first.', authError?.message);

    let channel: string;
    try {
      channel = String((await req.json())?.channel ?? '');
    } catch (err) {
      return refuse(400, 'bad body', String(err));
    }
    if (!CHANNEL.test(channel)) return refuse(400, 'bad channel', channel);

    const { data: profile, error: profileError } = await admin.from('profiles').select('banned_at').eq('id', me.user.id).maybeSingle();
    if (profileError) return refuse(500, "Couldn't check your account.", profileError.message);
    if (!profile) return refuse(403, "This account can't make calls.", { user: me.user.id, reason: 'no profile row' });
    if (profile.banned_at) return refuse(403, "This account can't make calls.", { user: me.user.id, reason: 'banned' });

    const uid = uidFor(me.user.id);
    let token: string;
    try {
      token = RtcTokenBuilder.buildTokenWithUid(APP_ID, CERTIFICATE, channel, uid, RtcRole.PUBLISHER, TTL, TTL);
    } catch (err) {
      return refuse(500, "Couldn't sign the video token.", err instanceof Error ? err.stack ?? err.message : String(err));
    }
    console.log('[agora-token] ok', { channel, uid });
    return json({ appId: APP_ID, token, uid, channel, expiresIn: TTL });
  } catch (err) {
    return refuse(500, 'Video token failed.', err instanceof Error ? err.stack ?? err.message : String(err));
  }
});
