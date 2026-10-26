import { supabase } from '../lib/supabase';
import { MEDIA_LIMITS, mediaKind } from './hub';

// Photos and videos on Hub profiles (supabase/migrations: posts). Posts
// live in the public posts bucket, under the author's own folder; who can
// see one follows who can see its author's profile.

export const POSTS_BUCKET = 'posts';
export const CAPTION_MAX = 2200;
export const TAG_MAX = 20;
const UPLOAD_TIMEOUT_MS = 180000;

export const OUT_OF_DATE = "The Hub's database isn't up to date yet, so this isn't available.";

/** A table or function the database doesn't have yet (the migration hasn't run). */
export const isMissing = (error) =>
  !!error && (['42P01', 'PGRST205', 'PGRST202', '42883', 'PGRST204', '42703'].includes(error.code) || /does not exist|schema cache/i.test(error.message || ''));

export function need() {
  if (!supabase) throw new Error('The Creative Hub is not connected yet.');
  return supabase;
}

export function check({ data, error }) {
  if (error) throw new Error(isMissing(error) ? OUT_OF_DATE : error.message || 'Something went wrong');
  return data;
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/3gpp': '3gp', 'video/webm': 'webm' };

/** Whether a picked photo or video can be posted: null if so, else why not. */
export function postProblem(asset) {
  if (!asset?.uri) return 'That file could not be opened.';
  const kind = mediaKind(asset);
  if (asset.fileSize && asset.fileSize > MEDIA_LIMITS[kind]) {
    return kind === 'video' ? 'That video is over 64 MB. Trim it or choose a shorter one.' : 'That photo is over 16 MB. Choose a smaller one.';
  }
  return null;
}

/** "@ama, kofi.beats" to ['ama', 'kofi.beats'] (each once, lower case). */
export function parseTags(text = '') {
  const names = String(text)
    .split(/[\s,]+/)
    .map((t) => t.replace(/^@/, '').toLowerCase())
    .filter((t) => /^[a-z0-9_.]{3,24}$/.test(t));
  return [...new Set(names)].slice(0, TAG_MAX);
}

/** Hub members' ids for these usernames (the ones that exist and you can see). */
export async function resolveUsernames(names) {
  if (!names.length) return [];
  return check(await need().from('profiles').select('id, username').in('username', names));
}

/**
 * Uploads a picked photo or video to posts/<you>/ and saves the post.
 * Throws a readable Error (too large, no connection, timed out).
 */
export async function createPost(userId, asset, { caption = '', tagged = [] } = {}) {
  const sb = need();
  const problem = postProblem(asset);
  if (problem) throw new Error(problem);
  const kind = mediaKind(asset);
  const type = asset.mimeType || (kind === 'video' ? 'video/mp4' : 'image/jpeg');
  const path = `${userId}/${kind}-${Date.now()}.${EXT[type] ?? (kind === 'video' ? 'mp4' : 'jpg')}`;
  let body;
  try {
    body = await (await fetch(asset.uri)).arrayBuffer();
  } catch {
    throw new Error('That file could not be read from your phone.');
  }
  if (body.byteLength > MEDIA_LIMITS[kind]) throw new Error(postProblem({ ...asset, fileSize: body.byteLength }));
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('The upload timed out. Check your connection and try again.')), UPLOAD_TIMEOUT_MS);
  });
  try {
    const res = await Promise.race([sb.storage.from(POSTS_BUCKET).upload(path, body, { contentType: type, upsert: false }), timeout]);
    if (res?.error) {
      const msg = res.error.message || '';
      if (/bucket not found/i.test(msg)) throw new Error(OUT_OF_DATE);
      if (/network|fetch|timed? ?out/i.test(msg)) throw new Error("Couldn't post: no connection. Try again in a moment.");
      throw new Error(`Couldn't upload. ${msg}`.trim());
    }
  } catch (err) {
    if (/Network request failed|Failed to fetch/i.test(err?.message || '')) throw new Error("Couldn't post: no connection. Try again in a moment.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
  const url = sb.storage.from(POSTS_BUCKET).getPublicUrl(path).data.publicUrl;
  return check(
    await sb
      .from('posts')
      .insert({
        author_id: userId,
        kind,
        media_path: path,
        media_url: url,
        media_width: asset.width ? Math.round(asset.width) : null,
        media_height: asset.height ? Math.round(asset.height) : null,
        media_duration_ms: asset.duration ? Math.round(asset.duration) : null,
        caption: caption.trim().slice(0, CAPTION_MAX),
        tagged: tagged.slice(0, TAG_MAX),
      })
      .select('*')
      .single(),
  );
}

/** A profile's posts for one tab ('posts' | 'reels' | 'tagged'), newest first. */
export async function listPosts(userId, tab = 'posts', limit = 60) {
  let q = need().from('posts').select('*').order('created_at', { ascending: false }).limit(limit);
  if (tab === 'tagged') q = q.contains('tagged', [userId]);
  else q = q.eq('author_id', userId);
  if (tab === 'reels') q = q.eq('kind', 'video');
  return check(await q) ?? [];
}

/** { posts, reels, tagged } counts for a profile; zeros if the database is behind. */
export async function postCounts(userId) {
  const sb = need();
  const count = async (q) => {
    const { count: n, error } = await q;
    return error ? 0 : n ?? 0;
  };
  const head = () => sb.from('posts').select('id', { count: 'exact', head: true });
  const [posts, reels, tagged] = await Promise.all([
    count(head().eq('author_id', userId)),
    count(head().eq('author_id', userId).eq('kind', 'video')),
    count(head().contains('tagged', [userId])),
  ]);
  return { posts, reels, tagged };
}

export async function deletePost(post) {
  const sb = need();
  check(await sb.from('posts').delete().eq('id', post.id));
  await sb.storage.from(POSTS_BUCKET).remove([post.media_path]).catch(() => {});
}

/** "1,204" and "12.4K" for the stats row. */
export function compactCount(n = 0) {
  if (n < 10000) return n.toLocaleString('en-GB');
  if (n < 1000000) return `${(n / 1000).toFixed(n < 100000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
}
