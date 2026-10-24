// Colour helpers that always hand native code a valid colour string. Station
// colours arrive from curated data and logo extraction, so never trust their
// format: anything that isn't a hex colour falls back.

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#abc" / "abc" / "#aabbcc" → { r, g, b }, or null. */
export function parseHex(hex) {
  const m = HEX.exec(typeof hex === 'string' ? hex.trim() : '');
  if (!m) return null;
  const s = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export const isHex = (hex) => !!parseHex(hex);

/** rgba() string for a hex colour at the given alpha (0–1). */
export function withAlpha(hex, alpha, fallback = '#E2A84B') {
  const c = parseHex(hex) ?? parseHex(fallback);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

function toHsl({ r, g, b }) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function toHex({ h, s, l }) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Hex colour shifted round the colour wheel by `dh` degrees, with saturation
 * and lightness nudged by `ds` / `dl` (clamped). The building block for a
 * mesh gradient's neighbouring tones.
 */
export function shiftHex(hex, dh = 0, ds = 0, dl = 0) {
  const c = parseHex(hex);
  if (!c) return hex;
  const { h, s, l } = toHsl(c);
  const clamp = (v) => Math.max(0, Math.min(1, v));
  return toHex({ h: (((h + dh) % 360) + 360) % 360, s: clamp(s + ds), l: clamp(l + dl) });
}

/** Hex for a hue (0 to 360) at the given saturation and lightness (0 to 1). */
export function hslHex(h, s = 0.65, l = 0.45) {
  return toHex({ h: ((h % 360) + 360) % 360, s, l });
}

/** A colour's hue in degrees, or 0 for greys. */
export function hueOf(hex) {
  const c = parseHex(hex);
  return c ? toHsl(c).h : 0;
}
