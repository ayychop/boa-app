// BOA HUB public profile pages, rendered on the server for search engines
// and link previews (WhatsApp, iMessage, X), which don't run the web app.
//
//   GET /profile-page?u=<username>   the profile's HTML page
//   GET /profile-page?sitemap=1      sitemap.xml of the indexable profiles
//
// It shows exactly what the web app shows someone without an account: the
// display picture, name, handle and Favourites, with a prompt to sign up or
// sign in. Posts and reels are never included. Private profiles render
// with noindex and aren't in the sitemap.
//
// Deploy: supabase functions deploy profile-page --no-verify-jwt
// Then point <web address>/u/* at it (or at the web app, which renders the
// same page in the browser), and /sitemap.xml at ?sitemap=1.
// PUBLIC_WEB_URL (a function secret) is the web address profiles live at.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const WEB_URL = (Deno.env.get('PUBLIC_WEB_URL') ?? 'https://www.boanetworks.com').replace(/\/+$/, '');
const BRAND = 'BOA HUB';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return res.json();
}

type Fav = { target_kind: string; target_id: string; target_label: string; target_meta: { logo?: string } };
type Profile = { username: string; display_name: string | null; avatar_url: string | null; indexable: boolean; favourites: Fav[] };

function page(p: Profile | null) {
  if (!p) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Profile not found · ${BRAND}</title></head><body style="background:#050506;color:#F3EFE8;font-family:system-ui;text-align:center;padding:64px 16px"><h1>This profile isn't available</h1></body></html>`;
  }
  const name = p.display_name?.trim() || `@${p.username}`;
  const handle = `@${p.username}`;
  const title = p.display_name?.trim() ? `${name} (${handle}) · ${BRAND}` : `${handle} · ${BRAND}`;
  const description = `${name} (${handle}) is on ${BRAND}, BOA Network's home for creatives. Join ${BRAND} to see their posts and reels.`;
  const url = `${WEB_URL}/u/${encodeURIComponent(p.username)}`;
  const image = p.avatar_url || `${WEB_URL}/og-default.png`;
  const ld = p.indexable
    ? `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        url,
        name: title,
        mainEntity: { '@type': 'Person', name, alternateName: handle, url, ...(p.avatar_url ? { image: p.avatar_url } : {}) },
      }).replace(/</g, '\\u003c')}</script>`
    : '';
  const favs = (p.favourites ?? [])
    .map((f) => `<li>${f.target_kind === 'station' ? 'Station' : 'BOA Original'}: ${esc(f.target_label)}</li>`)
    .join('');
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${p.indexable ? 'index, follow' : 'noindex'}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="profile"><meta property="og:site_name" content="${BRAND}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}"><meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(image)}">
${ld}
<style>body{margin:0;background:#050506;color:#F3EFE8;font-family:system-ui,sans-serif}main{max-width:720px;margin:0 auto;padding:32px 16px;text-align:center}img.a{width:104px;height:104px;border-radius:50%;object-fit:cover;border:2px solid #E2A84B}a.b{display:inline-block;margin:8px;padding:12px 22px;border-radius:999px;background:#E2A84B;color:#050506;font-weight:600;text-decoration:none}a.g{background:transparent;color:#F3EFE8;border:1px solid rgba(243,239,232,.3)}ul{list-style:none;padding:0;color:#B9B3AA}</style>
</head><body><main>
<p style="color:#E2A84B">Sign in or sign up to enjoy ${BRAND} fully.</p>
${p.avatar_url ? `<img class="a" src="${esc(p.avatar_url)}" alt="${esc(name)}">` : ''}
<h1>${esc(name)}</h1><p>${esc(handle)}</p>
${favs ? `<h2>Favourites</h2><ul>${favs}</ul>` : ''}
<h2>Posts and reels are for members</h2>
<p>Create a free ${BRAND} account to see ${esc(name)}'s posts and reels.</p>
<a class="b" href="${esc(WEB_URL)}/?hub=join">Sign up</a><a class="b g" href="${esc(WEB_URL)}/?hub=signin">Sign in</a>
</main></body></html>`;
}

async function sitemap() {
  const rows: { username: string; updated_at: string }[] = await rpc('public_profile_handles');
  const urls = rows
    .map((r) => `<url><loc>${esc(`${WEB_URL}/u/${encodeURIComponent(r.username)}`)}</loc><lastmod>${esc(new Date(r.updated_at).toISOString())}</lastmod></url>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams;
  try {
    if (params.has('sitemap')) {
      return new Response(await sitemap(), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
    }
    const handle = (params.get('u') ?? '').toLowerCase();
    const profile: Profile | null = /^[a-z0-9_.]{3,24}$/.test(handle) ? await rpc('public_profile', { handle }) : null;
    return new Response(page(profile), {
      status: profile ? 200 : 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
    });
  } catch {
    return new Response('Something went wrong', { status: 500 });
  }
});
