import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

// A station's artwork, found once and kept on the phone. Many directory
// logos are dead links, so this tries, in order:
//  1. the logo the station lists;
//  2. the images its own homepage advertises (og:image, twitter:image,
//     apple-touch-icon, icon links);
// downloading the first that is a real image into cache/logos. null means
// none was found: the record label, the lock screen and the widget then
// show the BOA Network logo instead.
const FOLDER = 'logos';
// Smaller than this is a tracking pixel or a 16px favicon, not a label.
const MIN_BYTES = 1500;
const PAGE_TIMEOUT_MS = 8000;
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36';

const jobs = new Map(); // station id -> Promise<string | null>
const known = new Map(); // station id -> string | null, once settled

function dir() {
  const d = new Directory(Paths.cache, FOLDER);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

const safe = (id) => String(id).replace(/[^\w-]/g, '_');

/** PNG, JPEG, GIF or WebP by its first bytes (an error page is none of these). */
export function isImage(b) {
  if (!b || b.length < 12) return false;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true;
  if (b[0] === 0xff && b[1] === 0xd8) return true;
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return true;
  return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
}

/** The homepage's own images, best first. Exported for tests. */
export function imagesInPage(html, base) {
  const out = [];
  const attr = (tag, name) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];
  for (const tag of html.match(/<meta[^>]+>/gi) || []) {
    const key = attr(tag, 'property') || attr(tag, 'name') || '';
    if (/^(og:image|twitter:image)(:src|:url)?$/i.test(key)) out.push(attr(tag, 'content'));
  }
  const icons = [];
  for (const tag of html.match(/<link[^>]+>/gi) || []) {
    const rel = attr(tag, 'rel') || '';
    if (!/icon/i.test(rel)) continue;
    const size = parseInt(attr(tag, 'sizes') || '0', 10) || (/apple-touch/i.test(rel) ? 180 : 32);
    icons.push({ href: attr(tag, 'href'), size });
  }
  icons.sort((a, b) => b.size - a.size);
  out.push(...icons.map((i) => i.href));
  return [...new Set(out.filter(Boolean).flatMap((u) => {
    try {
      return [new URL(u, base).href];
    } catch {
      return [];
    }
  }))].filter((u) => /^https:/i.test(u) && !/\.(svg|ico)(\?|$)/i.test(u));
}

async function homepageImages(homepage) {
  if (!/^https?:\/\//i.test(homepage || '') || /\.(mp3|m3u8?|pls|aac)(\?|$)/i.test(homepage)) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(homepage, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
    if (!res.ok) return [];
    const html = (await res.text()).slice(0, 300000);
    return imagesInPage(html, res.url || homepage);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function download(id, uri, n) {
  const file = new File(dir(), `${safe(id)}-${n}`);
  try {
    if (file.exists) file.delete();
    const out = (await File.downloadFileAsync(uri, file, { headers: { 'User-Agent': UA }, idempotent: true })) ?? file;
    if (out.size >= MIN_BYTES && isImage(out.bytesSync().subarray(0, 12))) return out.uri;
  } catch {}
  try {
    if (file.exists) file.delete();
  } catch {}
  return null;
}

async function find(station) {
  // A previous session already found one.
  for (let n = 0; n < 4; n++) {
    try {
      const f = new File(dir(), `${safe(station.id)}-${n}`);
      if (f.exists && f.size >= MIN_BYTES) return f.uri;
    } catch {}
  }
  if (station.logo) {
    const own = await download(station.id, station.logo, 0);
    if (own) return own;
  }
  const page = await homepageImages(station.homepage);
  for (let i = 0; i < Math.min(page.length, 3); i++) {
    const got = await download(station.id, page[i], i + 1);
    if (got) return got;
  }
  return null;
}

/**
 * Resolves to a local file uri for the station's artwork, or null for the
 * BOA logo. On the web the browser loads the listed logo itself.
 */
export function resolveLogo(station) {
  if (!station?.id) return Promise.resolve(null);
  if (Platform.OS === 'web') return Promise.resolve(station.logo ?? null);
  if (!jobs.has(station.id)) {
    const job = find(station)
      .catch(() => null)
      .then((uri) => {
        known.set(station.id, uri);
        return uri;
      });
    jobs.set(station.id, job);
  }
  return jobs.get(station.id);
}

/** The artwork resolved so far: a uri, null for BOA, undefined while looking. */
export const knownLogo = (id) => known.get(id);

/** The station's artwork for a component: uri, null (BOA) or undefined (looking). */
export function useStationLogo(station) {
  const [uri, setUri] = useState(() => (station ? knownLogo(station.id) : null));
  useEffect(() => {
    if (!station) return setUri(null);
    let alive = true;
    setUri(knownLogo(station.id));
    resolveLogo(station).then((u) => alive && setUri(u));
    return () => {
      alive = false;
    };
  }, [station?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return uri;
}
