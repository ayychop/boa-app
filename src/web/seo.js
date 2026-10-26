import { Platform } from 'react-native';
import { SITE_URL } from '../data/boaContent';

// Public Hub profiles on the web, for search engines and link previews.
// A profile lives at <web address>/u/<username>. The web address is the
// one the web app is hosted at (EXPO_PUBLIC_WEB_URL), else BOA's site.
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL?.trim() || SITE_URL).replace(/\/+$/, '');
export const BRAND = 'BOA HUB';
const DEFAULT_IMAGE = `${WEB_URL}/og-default.png`;
const DESCRIPTION_MAX = 160;

/** The username in a public profile path ("/u/jo.boa", "/@jo.boa"), else null. */
export function profileHandleFromPath(pathname = '') {
  const m = /^\/(?:u\/|@)([a-z0-9_.]{3,24})\/?$/i.exec(pathname);
  return m ? m[1].toLowerCase() : null;
}

export const profileUrl = (username) => `${WEB_URL}/u/${encodeURIComponent(username)}`;

const clip = (text, max) => {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

/**
 * Everything a search engine or a link preview reads for a profile: the
 * title ("Jo BOA (@jo.boa) · BOA HUB", so searching "Jo BOA BOA HUB"
 * finds it), a description, the picture, the canonical address and
 * schema.org ProfilePage data. Only what a signed-out visitor may see (the
 * name and picture); a private profile is marked noindex.
 */
export function profileMeta(profile) {
  const name = profile.display_name?.trim() || `@${profile.username}`;
  const handle = `@${profile.username}`;
  const description = clip(`${name} (${handle}) is on ${BRAND}, BOA Network's home for creatives. Join ${BRAND} to see their posts and reels.`, DESCRIPTION_MAX);
  const url = profileUrl(profile.username);
  const image = profile.avatar_url || DEFAULT_IMAGE;
  const title = profile.display_name?.trim() ? `${name} (${handle}) · ${BRAND}` : `${handle} · ${BRAND}`;
  const noindex = profile.indexable === false;
  return {
    title,
    description,
    url,
    image,
    noindex,
    jsonLd: noindex
      ? null
      : {
          '@context': 'https://schema.org',
          '@type': 'ProfilePage',
          url,
          name: title,
          mainEntity: {
            '@type': 'Person',
            name,
            alternateName: handle,
            url,
            ...(profile.avatar_url ? { image: profile.avatar_url } : {}),
          },
        },
  };
}

/** The tags for a profile that isn't there (or isn't public). Never indexed. */
export const missingMeta = () => ({ title: `Profile not found · ${BRAND}`, description: `This ${BRAND} profile isn't available.`, url: null, image: DEFAULT_IMAGE, jsonLd: null, noindex: true });

/**
 * Writes the tags into the page head (web only; a no-op on the phone).
 * Returns the elements it added, for the tests.
 */
export function applyMeta(meta, doc = Platform.OS === 'web' && typeof document !== 'undefined' ? document : null) {
  if (!doc) return [];
  doc.title = meta.title;
  const added = [];
  const set = (attr, key, content) => {
    let el = doc.head.querySelector(`meta[${attr}="${key}"]`);
    if (content == null) {
      el?.remove();
      return;
    }
    if (!el) {
      el = doc.createElement('meta');
      el.setAttribute(attr, key);
      doc.head.appendChild(el);
      added.push(el);
    }
    el.setAttribute('content', content);
  };
  set('name', 'description', meta.description);
  set('name', 'robots', meta.noindex ? 'noindex' : 'index, follow');
  set('property', 'og:type', 'profile');
  set('property', 'og:site_name', BRAND);
  set('property', 'og:title', meta.title);
  set('property', 'og:description', meta.description);
  set('property', 'og:image', meta.image);
  set('property', 'og:url', meta.url);
  set('name', 'twitter:card', 'summary');
  set('name', 'twitter:title', meta.title);
  set('name', 'twitter:description', meta.description);
  set('name', 'twitter:image', meta.image);

  let canonical = doc.head.querySelector('link[rel="canonical"]');
  if (meta.url) {
    if (!canonical) {
      canonical = doc.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      doc.head.appendChild(canonical);
      added.push(canonical);
    }
    canonical.setAttribute('href', meta.url);
  } else canonical?.remove();

  let ld = doc.getElementById('boa-profile-ld');
  if (meta.jsonLd) {
    if (!ld) {
      ld = doc.createElement('script');
      ld.id = 'boa-profile-ld';
      ld.type = 'application/ld+json';
      doc.head.appendChild(ld);
      added.push(ld);
    }
    // "<" escaped so a bio can never close the script tag.
    ld.textContent = JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c');
  } else ld?.remove();
  return added;
}
