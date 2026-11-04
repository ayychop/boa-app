// Small pure checks used by the moderation and account deletion functions.
// Kept free of Deno APIs so the app's Jest suite can run them too.

export type ImageRef = { bucket: string; path: string };

/** Whether this account owns that file: posts and avatars are <you>/..., chat-media is <conversation>/<you>/... */
export function ownsFile(userId: string, { bucket, path }: ImageRef): boolean {
  if (typeof path !== 'string' || path.length > 300 || path.includes('..') || path.startsWith('/')) return false;
  const parts = path.split('/');
  if (bucket === 'posts' || bucket === 'avatars') return parts.length >= 2 && parts[0] === userId;
  if (bucket === 'chat-media') return parts.length >= 3 && parts[1] === userId;
  return false;
}

/** The moderation categories that fired, without slashes ("harassment/threatening" becomes "harassment"), once each. */
export function friendlyCategories(categories: Record<string, boolean>): string[] {
  const out = new Set<string>();
  for (const [name, on] of Object.entries(categories ?? {})) if (on) out.add(name.split('/')[0].replace('-', '_'));
  return [...out];
}

/** CORS headers that let only the listed web origins call from a browser. The mobile app sends no Origin. */
export function corsHeaders(origin: string | null, allowed: Set<string>): Record<string, string> {
  const base = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  return origin && allowed.has(origin) ? { ...base, 'Access-Control-Allow-Origin': origin } : base;
}
