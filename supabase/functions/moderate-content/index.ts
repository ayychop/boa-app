// BOA HUB content moderation: checks text and photos before they are posted.
//
//   POST /moderate-content
//     { "surface": "post" | "message" | "avatar" | "profile" | "casting",
//       "text": "<what they typed>",                      (optional)
//       "image": { "bucket": "posts" | "avatars" | "chat-media", "path": "<file>" } }   (optional)
//   -> { "allowed": true }
//   -> { "allowed": false, "categories": ["harassment", ...] }
//   -> { "allowed": true, "skipped": "not_configured" }     (no OPENAI_API_KEY set yet)
//
// The app (src/safety/moderation.js) calls it before a post, message,
// caption, profile text or photo is saved. For a photo the app uploads the
// file first and passes its path, so nothing large travels twice; if the
// check refuses it, this function deletes the file, so a refused photo does
// not stay on the server. Text and the photo go to OpenAI's moderation API
// (omni-moderation-latest) in one request. Videos and voice notes are not
// checked (the API reads text and images); they are covered by reports and
// by the Admin Portal.
//
// What is stored: moderation_events keeps who, where it was headed and which
// categories fired. Never the text, never the photo.
//
// Not configured: with no OPENAI_API_KEY the function allows everything and
// says so (skipped), so the app keeps working until the key is set.
// Provider down: 502, and the app does NOT post (it fails closed).
//
// Protection: the caller's session is verified here (the gateway's JWT check
// stays on), they must not be banned, and each account is rate limited
// (public.edge_rate_limit, supabase/migrations/20261104120000_edge_rate_limits.sql).
//
// Deploy:
//   supabase secrets set OPENAI_API_KEY=<key>
//   supabase functions deploy moderate-content

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { hit, memoryLimiter } from '../_shared/rateLimit.ts';
import { friendlyCategories, type ImageRef, ownsFile } from '../_shared/safety.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const MODEL = 'omni-moderation-latest';
const MODERATIONS = 'https://api.openai.com/v1/moderations';
const SURFACES = ['post', 'message', 'avatar', 'profile', 'casting'];
const MAX_TEXT = 6000;
const PROVIDER_TIMEOUT_MS = 12_000;
const IMAGE_URL_SECONDS = 120;
const LIMITS = { perMinute: 40, perHour: 400 };

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const memory = memoryLimiter();

Deno.serve(async (req) => {
  const refuse = (status: number, error: string, detail?: unknown, headers: Record<string, string> = {}) => {
    console.error('[moderate-content]', status, error, detail ?? '');
    return json({ error }, status, headers);
  };
  try {
    if (req.method !== 'POST') return refuse(405, 'POST only');

    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return refuse(401, 'Sign in first.');
    const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: me } = await caller.auth.getUser();
    if (!me?.user) return refuse(401, 'Sign in first.');
    const userId = me.user.id;

    const minute = await hit(admin, memory, `moderate:${userId}:m`, 60, LIMITS.perMinute);
    if (!minute.allowed) return refuse(429, 'Too many attempts. Try again in a moment.', { userId }, { 'Retry-After': String(minute.retryAfter) });
    const hour = await hit(admin, memory, `moderate:${userId}:h`, 3600, LIMITS.perHour);
    if (!hour.allowed) return refuse(429, 'Too many attempts. Try again later.', { userId }, { 'Retry-After': String(hour.retryAfter) });

    let body: { surface?: string; text?: string; image?: ImageRef };
    try {
      body = await req.json();
    } catch (err) {
      return refuse(400, 'bad body', String(err));
    }
    const surface = SURFACES.includes(String(body?.surface)) ? String(body.surface) : null;
    if (!surface) return refuse(400, 'bad surface', body?.surface);
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
    const image = body.image && typeof body.image === 'object' ? body.image : null;
    if (!text && !image) return json({ allowed: true, empty: true });
    if (image && !ownsFile(userId, image)) return refuse(403, "That file isn't yours to check.", { userId, image });

    // Banned accounts do not post.
    const { data: profile } = await admin.from('profiles').select('banned_at').eq('id', userId).maybeSingle();
    if (profile?.banned_at) return refuse(403, "This account can't post.", { userId, reason: 'banned' });

    if (!OPENAI_KEY) {
      console.warn('[moderate-content] OPENAI_API_KEY is not set: nothing is being checked');
      return json({ allowed: true, skipped: 'not_configured' });
    }

    const input: Array<Record<string, unknown>> = [];
    if (text) input.push({ type: 'text', text });
    if (image) {
      const { data: signed, error } = await admin.storage.from(image.bucket).createSignedUrl(image.path, IMAGE_URL_SECONDS);
      if (error || !signed?.signedUrl) return refuse(404, "Couldn't find that file.", error?.message);
      input.push({ type: 'image_url', image_url: { url: signed.signedUrl } });
    }

    let result: { flagged: boolean; categories: Record<string, boolean> };
    try {
      const res = await fetch(MODERATIONS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({ model: MODEL, input }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
      if (!res.ok) return refuse(502, 'The content check is unavailable.', { status: res.status, body: (await res.text()).slice(0, 300) });
      result = (await res.json())?.results?.[0];
      if (!result || typeof result.flagged !== 'boolean') return refuse(502, 'The content check is unavailable.', 'no result');
    } catch (err) {
      return refuse(502, 'The content check is unavailable.', String(err));
    }

    if (!result.flagged) return json({ allowed: true });

    const categories = friendlyCategories(result.categories);
    console.warn('[moderate-content] refused', { userId, surface, categories, text: !!text, image: !!image });
    await admin.from('moderation_events').insert({ user_id: userId, kind: image ? 'image' : 'text', surface, categories });
    // A refused photo does not stay on the server.
    if (image) await admin.storage.from(image.bucket).remove([image.path]).catch(() => {});
    return json({ allowed: false, categories });
  } catch (err) {
    return refuse(500, 'The content check failed.', err instanceof Error ? err.stack ?? err.message : String(err));
  }
});
