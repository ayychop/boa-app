// BOA video calls: the incoming-call push.
//
//   POST /call-push   { "to": "<their user id>", "callId": "<call id>" }
//   -> { "sent", "removed" }
//
// A call rings over Realtime (src/calls/signaling.js), but Android freezes
// an app in the background and its Realtime socket with it, so a phone in
// a pocket only heard the ring once it was opened. This sends the same ring
// as a high-priority FCM push (through Expo, like message-push), which
// wakes the phone: it pops up on the ringtone's call channel, and tapping
// it opens the incoming call screen (src/context/CallContext.js).
//
// Only the caller can send it, signed in and not banned, to someone who
// hasn't blocked them (and whom they haven't blocked). Who is calling comes
// from the caller's own profile, never from the request.
//
// Deploy:
//   supabase functions deploy call-push

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Call ids are UUIDs (src/context/CallContext.js); allow the older format too.
const CHANNEL = /^[A-Za-z0-9-]{16,64}$/;
const RINGTONES = ['hiphop', 'rnb', 'afrobeats', 'bashment'];
// A call rings for 45 seconds (RING_MS); a push that arrives later is useless.
const RING_SECONDS = 45;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (req) => {
  const refuse = (status: number, error: string, detail?: unknown) => {
    console.error('[call-push]', status, error, detail ?? '');
    return json({ error }, status);
  };
  try {
    if (req.method !== 'POST') return refuse(405, 'POST only');
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return refuse(401, 'Sign in first.', 'no Authorization header');
    const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: me, error: authError } = await caller.auth.getUser();
    if (!me?.user) return refuse(401, 'Sign in first.', authError?.message);

    let to: string, callId: string;
    try {
      const body = await req.json();
      to = String(body?.to ?? '');
      callId = String(body?.callId ?? '');
    } catch (err) {
      return refuse(400, 'bad body', String(err));
    }
    if (!UUID.test(to) || to === me.user.id) return refuse(400, 'bad recipient', to);
    if (!CHANNEL.test(callId)) return refuse(400, 'bad call', callId);

    const [{ data: from }, { data: them }, { data: blocked }, { data: tokens }] = await Promise.all([
      admin.from('profiles').select('id, username, display_name, avatar_url, banned_at').eq('id', me.user.id).maybeSingle(),
      admin.from('profiles').select('ringtone_preference').eq('id', to).maybeSingle(),
      admin.rpc('is_blocked', { a: me.user.id, b: to }),
      admin.from('push_tokens').select('token').eq('user_id', to),
    ]);
    if (!from || from.banned_at) return refuse(403, "This account can't make calls.", { user: me.user.id });
    if (blocked) return json({ skipped: 'blocked' });
    if (!tokens?.length) return json({ skipped: 'no phones' });

    const name = from.display_name?.trim() || (from.username ? `@${from.username}` : 'BOA HUB member');
    const ringtone = RINGTONES.includes(them?.ringtone_preference) ? them!.ringtone_preference : RINGTONES[0];
    const pushes = tokens.map((t) => ({
      to: t.token,
      title: name,
      body: 'Incoming video call',
      sound: `${ringtone}.wav`,
      channelId: `boa-call-${ringtone}`,
      priority: 'high',
      ttl: RING_SECONDS,
      data: {
        type: 'call',
        callId,
        sentAt: Date.now(),
        from: { id: from.id, name, avatar_url: from.avatar_url ?? null },
      },
    }));

    const res = await fetch(EXPO_PUSH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(pushes),
    });
    const result = await res.json().catch(() => null);

    // Phones that uninstalled the app: forget their tokens.
    const gone = (result?.data ?? [])
      .map((r: { status: string; details?: { error?: string } }, i: number) => (r?.details?.error === 'DeviceNotRegistered' ? pushes[i].to : null))
      .filter(Boolean);
    if (gone.length) await admin.from('push_tokens').delete().in('token', gone);

    console.log('[call-push] ok', { callId, sent: pushes.length, removed: gone.length });
    return json({ sent: pushes.length, removed: gone.length });
  } catch (err) {
    return refuse(500, 'Call push failed.', err instanceof Error ? err.stack ?? err.message : String(err));
  }
});
