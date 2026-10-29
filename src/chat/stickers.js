import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';

// Animated emoji for chat (stickers and reactions): Google's Noto Animated
// Emoji, free to use (CC BY 4.0). The catalogue is fetched from Google and
// kept on the phone, refreshed once a day, so emoji Google adds turn up on
// their own, marked New, and their animations are downloaded ahead.
// A message stores the emoji itself; its animation is looked up from it.

export const CATALOGUE_URL = 'https://googlefonts.github.io/noto-emoji-animation/data/api.json';
const ASSET = 'https://fonts.gstatic.com/s/e/notoemoji/latest';
const KEY = 'boa.stickers.v1';
const RECENT_KEY = 'boa.stickers.recent';
const REFRESH_MS = 24 * 60 * 60 * 1000;
const RECENT_MAX = 24;
const PREFETCH_MAX = 48;

/** The quick reactions, in order, on every message. */
export const QUICK_REACTIONS = ['❤️', '😂', '🔥', '😮', '😢', '🙏'];

// Skin tones are left out of the picker; the default tone stands for them.
const TONE = /_1f3f[b-f]/;

/** '❤️' -> '2764_fe0f', as Google names the files. */
export const toCode = (emoji) =>
  Array.from(String(emoji ?? ''))
    .map((c) => c.codePointAt(0).toString(16))
    .join('_');

/** '2764_fe0f' -> '❤️'. */
export const fromCode = (code) => String.fromCodePoint(...String(code).split('_').map((h) => parseInt(h, 16)));

/** The animation for an emoji (an animated WebP). */
export const stickerUrl = (emoji) => `${ASSET}/${toCode(emoji)}/512.webp`;

// Shown before the catalogue first arrives, or without a connection.
const STARTER = [
  ['1f602', 'Smileys and emotions', ':joy:'],
  ['1f62d', 'Smileys and emotions', ':loudly-crying:'],
  ['1f60d', 'Smileys and emotions', ':heart-eyes:'],
  ['1f970', 'Smileys and emotions', ':smiling-face-with-hearts:'],
  ['1f618', 'Smileys and emotions', ':kissing-heart:'],
  ['1f60e', 'Smileys and emotions', ':sunglasses-face:'],
  ['1f973', 'Smileys and emotions', ':partying-face:'],
  ['1f929', 'Smileys and emotions', ':star-struck:'],
  ['1f62e', 'Smileys and emotions', ':open-mouth:'],
  ['1f644', 'Smileys and emotions', ':rolling-eyes:'],
  ['1f97a', 'Smileys and emotions', ':pleading:'],
  ['1f480', 'Smileys and emotions', ':skull:'],
  ['1f525', 'Travel and places', ':fire:'],
  ['2764_fe0f', 'Smileys and emotions', ':red-heart:'],
  ['2764_fe0f_200d_1f525', 'Smileys and emotions', ':fire-heart:'],
  ['1f44d', 'People', ':thumbs-up:'],
  ['1f64f', 'People', ':folded-hands:'],
  ['1f44f', 'People', ':clap:'],
  ['1f4af', 'Symbols', ':100:'],
  ['2728', 'Activities and events', ':sparkles:'],
  ['1f389', 'Activities and events', ':party-popper:'],
  ['1f3b6', 'Objects', ':musical-notes:'],
].map(([code, category, tag]) => ({ code, emoji: fromCode(code), category, tags: [tag], popularity: 0 }));

/** Google's catalogue, shaped for the picker: most used first, no skin tones. */
export function shapeCatalogue(json) {
  return (json?.icons ?? [])
    .filter((i) => i?.codepoint && !TONE.test(i.codepoint))
    .map((i) => ({ code: i.codepoint, emoji: fromCode(i.codepoint), category: i.categories?.[0] ?? 'Smileys and emotions', tags: i.tags ?? [], popularity: i.popularity ?? 0 }))
    .sort((a, b) => b.popularity - a.popularity);
}

let memo = null; // { at, icons, fresh }
const listeners = new Set();
const announce = () => listeners.forEach((fn) => fn(memo));

async function prefetch(icons) {
  try {
    if (!requireOptionalNativeModule('ExpoImage')) return;
    const { Image } = require('expo-image');
    await Image.prefetch(icons.slice(0, PREFETCH_MAX).map((i) => stickerUrl(i.emoji)), 'disk');
  } catch {}
}

/**
 * The catalogue: from the phone at once, then from Google if it's a day
 * old. Emoji Google has added since the last fetch come back in `fresh`
 * (shown as New) and are downloaded ahead.
 */
export async function loadStickers({ fetcher = fetch, now = Date.now() } = {}) {
  if (!memo) {
    try {
      const saved = JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null');
      if (saved?.icons?.length) memo = saved;
    } catch {}
  }
  if (memo && now - memo.at < REFRESH_MS) return memo;
  try {
    const res = await fetcher(CATALOGUE_URL);
    if (!res.ok) throw new Error(String(res.status));
    const icons = shapeCatalogue(await res.json());
    if (!icons.length) throw new Error('empty');
    const known = new Set((memo?.icons ?? []).map((i) => i.code));
    // The first fetch isn't news: everything would be New.
    const added = memo ? icons.filter((i) => !known.has(i.code)).map((i) => i.code) : [];
    memo = { at: now, icons, fresh: [...new Set([...added, ...(memo?.fresh ?? [])])].slice(0, 60) };
    AsyncStorage.setItem(KEY, JSON.stringify(memo)).catch(() => {});
    const byCode = new Map(icons.map((i) => [i.code, i]));
    prefetch([...memo.fresh.map((c) => byCode.get(c)).filter(Boolean), ...icons]);
  } catch {
    memo = memo ?? { at: 0, icons: STARTER, fresh: [] };
  }
  announce();
  return memo;
}

/** Once seen in the picker, New ones are just emoji. */
export function clearFresh() {
  if (!memo?.fresh?.length) return;
  memo = { ...memo, fresh: [] };
  AsyncStorage.setItem(KEY, JSON.stringify(memo)).catch(() => {});
  announce();
}

export async function recentStickers() {
  try {
    return JSON.parse((await AsyncStorage.getItem(RECENT_KEY)) ?? '[]');
  } catch {
    return [];
  }
}

export async function rememberSticker(emoji) {
  const next = [emoji, ...(await recentStickers()).filter((e) => e !== emoji)].slice(0, RECENT_MAX);
  await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
  return next;
}

/** { icons, fresh, recent } for the picker; starts with the starter set. */
export function useStickerCatalogue(open = true) {
  const [cat, setCat] = useState(memo ?? { icons: STARTER, fresh: [] });
  const [recent, setRecent] = useState([]);
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    listeners.add(setCat);
    loadStickers().then((m) => alive && setCat(m));
    recentStickers().then((r) => alive && setRecent(r));
    return () => {
      alive = false;
      listeners.delete(setCat);
    };
  }, [open]);
  return { ...cat, recent };
}

/** For tests: forget what's in memory. */
export function __reset() {
  memo = null;
}
