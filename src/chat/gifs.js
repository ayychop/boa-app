import Constants from 'expo-constants';

// GIFs in chat: Giphy's API (the same trending feed TikTok-style reaction
// GIFs come from), picked inside the app and sent as a message of its own.
// The keyboard's GIF button can't be used for this: a plain text field has
// nowhere to put an image, which is the "Can't enter this content here."
// Android shows. So the Composer has its own GIF button instead.
//
// The key is a Giphy SDK/API key (developers.giphy.com, free). It reaches the
// app as GIPHY_API_KEY (app.config.js) or EXPO_PUBLIC_GIPHY_API_KEY. Without
// one the picker says so instead of failing.

const API = 'https://api.giphy.com/v1/gifs';
const PAGE = 24;

export const gifKey = () => (Constants.expoConfig?.extra?.giphyApiKey || process.env.EXPO_PUBLIC_GIPHY_API_KEY || '').trim();

/** The shelves along the top of the picker; each is a search ('' is the trending feed). */
export const GIF_SHELVES = [
  { id: 'trending', label: 'Trending', query: '', icon: 'trending-up' },
  { id: 'tiktok', label: 'TikTok', query: 'tiktok trend', icon: 'musical-notes' },
  { id: 'reactions', label: 'Reactions', query: 'reaction', icon: 'happy-outline' },
  { id: 'dance', label: 'Dance', query: 'dance', icon: 'musical-note-outline' },
  { id: 'funny', label: 'Funny', query: 'funny', icon: 'sparkles-outline' },
  { id: 'hype', label: 'Hype', query: 'hype celebrate', icon: 'flame-outline' },
  { id: 'love', label: 'Love', query: 'love', icon: 'heart-outline' },
  { id: 'sad', label: 'Sad', query: 'sad crying', icon: 'rainy-outline' },
];

// Only Giphy's own media hosts are ever shown or stored. The database
// checks the same thing (supabase/migrations/20261030120000_gif_messages.sql),
// so a message can't point the app at anywhere else.
const GIF_HOST = /^https:\/\/(?:media\d*\.giphy\.com|i\.giphy\.com)\/[^\s]+$/i;

/** Whether this is a GIF address we're willing to load: https, on Giphy's media hosts. */
export const isGifUrl = (url) => typeof url === 'string' && url.length <= 600 && GIF_HOST.test(url);

/** Giphy's response, as the picker uses it: { id, url (to send), preview, width, height, title }. */
export function shapeGifs(json) {
  const out = [];
  for (const g of json?.data ?? []) {
    const im = g?.images ?? {};
    // Sent: a GIF small enough to land quickly on mobile data; shown: a thumbnail of it.
    const send = im.downsized_medium?.url ? im.downsized_medium : im.downsized?.url ? im.downsized : im.fixed_width;
    const view = im.fixed_width_small?.url ? im.fixed_width_small : im.fixed_width;
    if (!g?.id || !isGifUrl(send?.url) || !isGifUrl(view?.url)) continue;
    const width = Number(send.width) || Number(view.width) || 200;
    const height = Number(send.height) || Number(view.height) || 200;
    out.push({ id: String(g.id), url: send.url, preview: view.url, width, height, title: (g.title || '').trim() });
  }
  return out;
}

/** A page of GIFs: { items, next } (next is null at the end). Throws a readable error. */
export async function loadGifs({ query = '', offset = 0, signal } = {}) {
  const key = gifKey();
  if (!key) throw new Error('NO_KEY');
  const q = query.trim();
  const params = new URLSearchParams({ api_key: key, limit: String(PAGE), offset: String(offset), rating: 'pg-13', lang: 'en', bundle: 'messaging_non_clips' });
  if (q) params.set('q', q.slice(0, 50));
  let res;
  try {
    res = await fetch(`${API}/${q ? 'search' : 'trending'}?${params}`, { signal });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new Error("Couldn't reach GIPHY. Check your connection.");
  }
  if (res.status === 429) throw new Error('GIPHY is busy. Try again in a minute.');
  if (!res.ok) throw new Error("GIFs aren't available right now.");
  const json = await res.json();
  const items = shapeGifs(json);
  const total = json?.pagination?.total_count ?? 0;
  const seen = offset + (json?.data?.length ?? 0);
  return { items, next: json?.data?.length && seen < total ? seen : null };
}
