import { Platform } from 'react-native';
import ImageColors from 'react-native-image-colors';

// Extracted glow colour per station, Spotify-style. Results (including
// "no usable colour") are cached for the session.
const cache = new Map();

function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function hslToHex({ h, s, l }) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// Turn whatever the palette gave us into a glow that's safe on charcoal:
// greys, near-blacks and near-whites mean "no colour" (fall back), and the
// rest is normalised to a rich mid-tone so it can never become a bright wash
// that hurts the text.
function toGlow(candidates) {
  const scored = candidates
    .map(hexToHsl)
    .filter(Boolean)
    .filter((c) => c.s >= 0.28 && c.l >= 0.12 && c.l <= 0.9)
    .sort((a, b) => b.s * (1 - Math.abs(b.l - 0.5)) - a.s * (1 - Math.abs(a.l - 0.5)));
  if (!scored.length) return null;
  const best = scored[0];
  return hslToHex({ h: best.h, s: Math.max(0.55, Math.min(best.s, 0.9)), l: Math.max(0.45, Math.min(best.l, 0.58)) });
}

function candidatesFrom(result) {
  if (result.platform === 'ios') return [result.primary, result.secondary, result.detail, result.background];
  return [result.vibrant, result.lightVibrant, result.darkVibrant, result.dominant, result.muted];
}

async function extract(uri, key) {
  const result = await ImageColors.getColors(uri, { fallback: '#000000', cache: true, key, quality: 'low' });
  return toGlow(candidatesFrom(result));
}

// Browsers only let a canvas read pixels from images served with CORS
// headers, which most station favicons aren't. Retry through wsrv.nl, a
// public image proxy that adds them (and shrinks the image to 64px).
const corsProxy = (uri) => `https://wsrv.nl/?url=${encodeURIComponent(uri)}&w=64&h=64&fit=contain&output=png`;

/** Most vibrant colour in the station's logo as a glow hex, or null. */
export function getStationGlow(station) {
  if (!station?.logo) return Promise.resolve(null);
  if (cache.has(station.id)) return cache.get(station.id);
  const promise = extract(station.logo, station.id)
    .catch(() => (Platform.OS === 'web' ? extract(corsProxy(station.logo), `${station.id}-proxy`) : null))
    .catch(() => null);
  cache.set(station.id, promise);
  return promise;
}

// When a logo gives us nothing usable: a deep, warm brand gold, so the stage
// still glows faintly instead of going dead black.
export const FALLBACK_GLOW = '#2A1F10';

/**
 * A colour that's already known, without starting any extraction: the
 * station's `brandColor`, else a logo colour extracted earlier this session.
 * Resolves to null otherwise (and for the warm fallback).
 */
export function cachedGlow(station) {
  if (station?.brandColor) return Promise.resolve(station.brandColor);
  const pending = station && cache.get(station.id);
  return pending ? pending.then((c) => c ?? null) : Promise.resolve(null);
}

/**
 * The glow behind a station's record, in priority order: the station's own
 * `brandColor` (curated data), the most vibrant colour in its logo, then
 * the warm gold fallback. Always resolves to a colour.
 */
export function glowFor(station) {
  if (station?.brandColor) return Promise.resolve(station.brandColor);
  return getStationGlow(station).then((c) => c ?? FALLBACK_GLOW);
}
