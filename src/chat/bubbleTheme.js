// Chat Appearance: the colour and glass of your own message bubbles, kept
// on your profile (profiles.chat_theme) so it follows you to every phone.
//
// A theme is { color: '#RRGGBB', transparency: 0..1 }. Null means "the
// vibe's own bubbles" (src/chat/vibes.js). Text on the bubble is chosen for
// contrast against what the eye actually sees: the colour at its opacity,
// over the thread's backdrop. Every function here is a worklet, so the
// Chat Appearance preview can recolour its text on the UI thread while the
// transparency slider moves.

export const PALETTE = [
  { id: 'gold', label: 'BOA Gold', color: '#E2A84B' },
  { id: 'champagne', label: 'Champagne', color: '#F3D9A4' },
  { id: 'rose', label: 'Rose Gold', color: '#E8A39A' },
  { id: 'sunset', label: 'Sunset Orange', color: '#FF7A3D' },
  { id: 'crimson', label: 'Crimson', color: '#C8102E' },
  { id: 'amethyst', label: 'Amethyst', color: '#9B5DE5' },
  { id: 'neon', label: 'Neon Blue', color: '#2F7BFF' },
  { id: 'emerald', label: 'Emerald', color: '#0F9D6E' },
  { id: 'white', label: 'Pure White', color: '#FFFFFF' },
  { id: 'black', label: 'Midnight Black', color: '#0E0E12' },
];

export const DEFAULT_THEME = Object.freeze({ color: PALETTE[0].color, transparency: 0.1 });

const DARK_TEXT = '#000000'; // pure black: even the hardest mid-tone blend clears 4.5:1
const LIGHT_TEXT = '#FFFFFF';

/** A stored theme, checked: anything malformed is treated as no theme. */
export function cleanTheme(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const color = typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color.toUpperCase() : null;
  const t = Number(raw.transparency);
  if (!color || !Number.isFinite(t)) return null;
  return { color, transparency: Math.round(Math.max(0, Math.min(1, t)) * 100) / 100 };
}

export function rgb(hex) {
  'worklet';
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex, alpha) {
  'worklet';
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${Math.round(alpha * 1000) / 1000})`;
}

function luminance([r, g, b]) {
  'worklet';
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two luminances. */
export function contrast(a, b) {
  'worklet';
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** What the bubble looks like on screen: its colour at its opacity over the backdrop. */
export function seen(hex, transparency, backdrop) {
  'worklet';
  const a = 1 - transparency;
  const c = rgb(hex);
  const bg = rgb(backdrop);
  return [0, 1, 2].map((i) => Math.round(c[i] * a + bg[i] * (1 - a)));
}

/** Black or white text, whichever reads better on that bubble. */
export function textOn(hex, transparency, backdrop) {
  'worklet';
  const l = luminance(seen(hex, transparency, backdrop));
  return contrast(l, luminance(rgb(DARK_TEXT))) >= contrast(l, luminance(rgb(LIGHT_TEXT))) ? DARK_TEXT : LIGHT_TEXT;
}

/** The text colour's contrast on that bubble (tests hold every choice to 4.5:1). */
export function textContrast(hex, transparency, backdrop) {
  const l = luminance(seen(hex, transparency, backdrop));
  return contrast(l, luminance(rgb(textOn(hex, transparency, backdrop))));
}

/**
 * The vibe with your bubbles swapped for your theme: a glass gradient in
 * your colour (lighter at the top, like light catching it), a bright edge,
 * a soft glow in the same colour, and text that reads on it.
 */
export function withChatTheme(vibe, theme) {
  const t = cleanTheme(theme);
  if (!t) return vibe;
  const a = 1 - t.transparency;
  const backdrop = vibe.mesh[1];
  const text = textOn(t.color, t.transparency, backdrop);
  const [r, g, b] = rgb(t.color);
  const lift = (v) => Math.round(v + (255 - v) * 0.22);
  const sink = (v) => Math.round(v * 0.82);
  return {
    ...vibe,
    mine: [`rgba(${lift(r)},${lift(g)},${lift(b)},${a})`, rgba(t.color, a), `rgba(${sink(r)},${sink(g)},${sink(b)},${a})`],
    mineText: text,
    mineMeta: text === DARK_TEXT ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.72)',
    mineEdge: rgba(t.color, Math.min(1, a + 0.35)),
    mineGlow: `0px 0px 14px ${rgba(t.color, 0.35 * a + 0.1)}`,
  };
}
