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
// Abuse protection. This function is deployed without the gateway's JWT check
// (--no-verify-jwt), so anyone on the internet can reach it, and every
// defence is here, in order, cheapest first:
//   1. a per-address limit held in memory, to shed a flood before any work;
//   2. an optional app key (AGORA_TOKEN_API_KEY, header x-boa-key): when the
//      secret is set, a request without it is refused. The key ships in the
//      app, so it deters casual scripts; it is not what protects the function;
//   3. a caller who has already failed to sign in too often is turned away
//      without being checked again (429);
//   4. the person's own session is verified here, in code, and they must have
//      a profile that is not banned: no session, no token, ever;
//   5. a per-account limit, so a signed-in account cannot mint tokens in bulk.
// The limits live in the database (public.edge_rate_limit, one count for
// every instance) and fall back to memory if it cannot be reached. A refusal
// is a 429 with Retry-After.
//
// Deploy:
//   supabase db push        (the rate limit table and function)
//   supabase secrets set AGORA_APP_ID=<App ID> AGORA_APP_CERTIFICATE=<Primary Certificate>
//   supabase secrets set AGORA_TOKEN_API_KEY=<long random string>      (optional)
//   supabase functions deploy agora-token --no-verify-jwt
// (Agora Console, your project, "Secured mode: APP ID + Token".)

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { RtcRole, RtcTokenBuilder } from 'npm:agora-token@2.0.7';
import { clientIp, hit, memoryLimiter, safeEqual } from '../_shared/rateLimit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_ID = Deno.env.get('AGORA_APP_ID') ?? '';
const CERTIFICATE = Deno.env.get('AGORA_APP_CERTIFICATE') ?? '';
const API_KEY = Deno.env.get('AGORA_TOKEN_API_KEY') ?? '';
const TTL = 3600;
// The limits. A call needs one token (and one more an hour in), so these are
// far above real use and far below abuse.
const LIMITS = {
  ipPerMinute: 30, // any request from one address, signed in or not
  failedSignIns: { windowSeconds: 600, max: 8 }, // bad or missing sessions per address
  userPerMinute: 8, // tokens for one account
  userPerHour: 40,
};
// Call ids are UUIDs (src/context/CallContext.js); allow the older format too.
const CHANNEL = /^[A-Za-z0-9-]{16,64}$/;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const memory = memoryLimiter();

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

    const ip = clientIp(req);
    const tooMany = (retryAfter: number, detail: unknown) => {
      console.error('[agora-token] 429', detail);
      return json({ error: 'Too many attempts. Try again in a moment.' }, 429, { 'Retry-After': String(retryAfter) });
    };
    const failKey = `agora:fail:${ip}`;
    const failed = LIMITS.failedSignIns;
    // A sign-in failure counts against the address; 401 until it passes the limit, then 429.
    const unauthorized = async (detail: unknown) => {
      const v = await hit(admin, memory, failKey, failed.windowSeconds, failed.max);
      return v.allowed ? refuse(401, 'Sign in first.', detail) : tooMany(v.retryAfter, { ip, reason: 'too many failed sign ins' });
    };

    // 1. Shed a flood in memory, before anything costs money.
    const burst = memory.hit(`agora:ip:${ip}`, 60, LIMITS.ipPerMinute);
    if (!burst.allowed) return tooMany(burst.retryAfter, { ip, reason: 'address over its per minute limit' });

    // 2. The app key, when one is configured.
    if (API_KEY && !safeEqual(req.headers.get('x-boa-key') ?? '', API_KEY)) return unauthorized('bad or missing app key');

    // 3. Someone already failing to sign in is turned away unchecked.
    const past = await hit(admin, memory, failKey, failed.windowSeconds, failed.max, 0);
    if (!past.allowed) return tooMany(past.retryAfter, { ip, reason: 'address is locked out' });

    // 4. No auth header (or an expired session) is a clear 401, never a crash.
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return unauthorized('no Authorization header');
    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: me, error: authError } = await caller.auth.getUser();
    if (!me?.user) return unauthorized(authError?.message);

    // 5. This account's own limit.
    const minute = await hit(admin, memory, `agora:user:${me.user.id}:m`, 60, LIMITS.userPerMinute);
    if (!minute.allowed) return tooMany(minute.retryAfter, { user: me.user.id, reason: 'account over its per minute limit' });
    const hour = await hit(admin, memory, `agora:user:${me.user.id}:h`, 3600, LIMITS.userPerHour);
    if (!hour.allowed) return tooMany(hour.retryAfter, { user: me.user.id, reason: 'account over its hourly limit' });

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
