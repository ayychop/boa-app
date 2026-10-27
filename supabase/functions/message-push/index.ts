// BOA HUB new-message pushes, WhatsApp style: a heads-up popup with the
// sender's name, the message (or what kind of media it is), the BOA mark
// as the small icon and the recipient's own chat sound.
//
// Called by the database (public.on_message_push, in
// supabase/migrations/20261026210000_premium_blocks_push.sql) for every new
// message, or by a Database Webhook on messages INSERT; the body is the
// webhook shape: { type: 'INSERT', table: 'messages', record }.
//
// Deploy:
//   supabase functions deploy message-push --no-verify-jwt
//   supabase secrets set PUSH_WEBHOOK_SECRET=<a long random string>
// Then in the SQL editor:
//   select private.set_push_function('https://<project>.supabase.co/functions/v1/message-push', '<same secret>');
//
// Message requests (someone new, not yet accepted: see
// supabase/migrations/20261027210000_inbox_folders_and_requests.sql) are
// delivered quietly: no sound, no buzz, no heads-up popup, on the app's
// low-importance requests channel, and on iPhone as a passive notification
// that doesn't light the screen. They wait in the shade, and in Requests.
//
// Pushes go through Expo's push service, which hands Android ones to FCM
// using the FCM key uploaded to EAS (eas credentials, Android, Push
// Notifications: FCM V1). The heads-up popup comes from the phone's chat
// channel (high importance, created by the app) plus priority 'high' here.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? '';
const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

type Message = { id: string; conversation_id: string; sender_id: string; kind: string; body: string | null };

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

export function previewOf(m: Pick<Message, 'kind' | 'body'>) {
  switch (m.kind) {
    case 'image':
      return '📷 Photo';
    case 'video':
      return '🎬 Video';
    case 'voice':
      return '🎙️ Voice note';
    default:
      return (m.body ?? '').slice(0, 140);
  }
}

/** Constant-time compare, so the secret can't be guessed a byte at a time. */
function same(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!SECRET || !same(req.headers.get('x-boa-push-secret') ?? '', SECRET)) return json({ error: 'forbidden' }, 403);

  let m: Message;
  try {
    const payload = await req.json();
    m = payload?.record;
    if (payload?.table !== 'messages' || !m?.id || !m.conversation_id || !m.sender_id) return json({ skipped: 'not a message' });
  } catch {
    return json({ error: 'bad body' }, 400);
  }

  // With the accepted columns if the inbox migration has run; without, every message is an ordinary one.
  let { data: conv, error: convError } = await db.from('conversations').select('user_a, user_b, a_accepted_at, b_accepted_at').eq('id', m.conversation_id).maybeSingle();
  if (convError) ({ data: conv } = await db.from('conversations').select('user_a, user_b').eq('id', m.conversation_id).maybeSingle());
  if (!conv) return json({ skipped: 'no conversation' });
  const recipient = conv.user_a === m.sender_id ? conv.user_b : conv.user_a;
  const side = conv.user_a === recipient ? 'a_accepted_at' : 'b_accepted_at';
  const request = side in conv && !conv[side];

  const { data: blocked } = await db.rpc('is_blocked', { a: m.sender_id, b: recipient });
  if (blocked) return json({ skipped: 'blocked' });

  const [{ data: sender }, { data: tokens }] = await Promise.all([
    db.from('profiles').select('username, display_name').eq('id', m.sender_id).maybeSingle(),
    db.from('push_tokens').select('token, sound').eq('user_id', recipient),
  ]);
  if (!tokens?.length) return json({ skipped: 'no phones' });

  const title = sender?.display_name?.trim() || (sender?.username ? `@${sender.username}` : 'BOA HUB');
  const body = previewOf(m);
  const pushes = tokens.map((t) =>
    request
      ? {
          to: t.token,
          title: 'Message request',
          // Who, never what: it's someone you haven't accepted yet.
          body: `${title} wants to message you`,
          channelId: 'boa-chat-requests',
          priority: 'normal',
          interruptionLevel: 'passive',
          data: { type: 'chat', conversationId: m.conversation_id, messageId: m.id, request: true },
        }
      : {
          to: t.token,
          title,
          body,
          sound: `chat_${t.sound}.wav`,
          // The app's high-importance channel for this sound: that's what makes
          // Android pop it up over whatever's on screen.
          channelId: `boa-chat-${t.sound}`,
          priority: 'high',
          data: { type: 'chat', conversationId: m.conversation_id, messageId: m.id },
        },
  );

  const res = await fetch(EXPO_PUSH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(pushes),
  });
  const result = await res.json().catch(() => null);

  // Phones that uninstalled the app: forget their tokens.
  const gone = (result?.data ?? []).map((r: { status: string; details?: { error?: string } }, i: number) => (r?.details?.error === 'DeviceNotRegistered' ? pushes[i].to : null)).filter(Boolean);
  if (gone.length) await db.from('push_tokens').delete().in('token', gone);

  return json({ sent: pushes.length, removed: gone.length, request });
});
