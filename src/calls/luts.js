import { Directory, File, Paths } from 'expo-file-system';

// The call presets' colour grades, as Cube LUTs for Agora's filter effect
// (setFilterEffectOptions, src/calls/media). Agora takes only a 32 x 32 x 32
// table, from a file on the phone, so each grade is a small colour function
// here, written out once to the cache the first time it's used. Bump
// VERSION when a grade changes, so phones write it again.

const VERSION = 2;
export const LUT_SIZE = 32;

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// A gentle S-curve: k 0 is none, 1 is strong. Shadows deeper, highlights brighter.
const curve = (v, k) => clamp(v + k * (v - 0.5) * (1 - Math.abs(2 * v - 1)) * 0.9);
// Colour pulled towards (s < 1) or pushed away from (s > 1) its grey.
const saturate = (r, g, b, s) => {
  const y = luma(r, g, b);
  return [y + (r - y) * s, y + (g - y) * s, y + (b - y) * s];
};

// How far the highlights are lifted, where on the tone scale, and how wide.
const GLASS = { lift: 0.075, centre: 0.46, width: 0.3 };
const smooth = (v) => v * v * (3 - 2 * v);

/** The 'enhance' grade: (r, g, b) in 0..1 to [r, g, b]. Exported to be tested. */
export function enhanceSkin(r, g, b) {
  const y = luma(r, g, b);
  // A bell of light on the mid-tones, nothing at black, little at white.
  const bell = Math.exp(-Math.pow((y - GLASS.centre) / GLASS.width, 2));
  const edge = smooth(clamp(y / 0.12)) * smooth(clamp((1 - y) / 0.08));
  const lifted = y > 0.0001 ? 1 + (GLASS.lift * bell * edge) / y : 1;
  let [lr, lg, lb] = [r * lifted, g * lifted, b * lifted];
  // Vibrance: the thinner the colour, the more it is topped up.
  const max = Math.max(lr, lg, lb);
  const sat = max > 0.0001 ? (max - Math.min(lr, lg, lb)) / max : 0;
  const ly = luma(lr, lg, lb);
  const v = 1 + 0.12 * (1 - sat);
  lr = ly + (lr - ly) * v;
  lg = ly + (lg - ly) * v;
  lb = ly + (lb - ly) * v;
  // A hair of warmth, so skin stays golden, never cool.
  return [clamp(lr * 1.012), clamp(lg), clamp(lb * 0.985)];
}

/** Each grade: (r, g, b) in 0..1 to [r, g, b]. */
export const GRADES = {
  // Clean and bright: a soft lift, neutral whites, a touch of contrast.
  studio: (r, g, b) => {
    const lift = (v) => curve(0.03 + v * 0.97, 0.25);
    return saturate(lift(r), lift(g), lift(b) * 0.99 + 0.01, 1.05);
  },
  // Warm sunset skin: reds and greens up a little, blue down, richer colour.
  golden: (r, g, b) => {
    const [sr, sg, sb] = saturate(r, g, b, 1.12);
    return [curve(sr * 1.06 + 0.025, 0.15), curve(sg * 1.01 + 0.012, 0.15), curve(sb * 0.86, 0.15)];
  },
  // Film: teal shadows, orange highlights, deeper contrast, colour held back.
  cinematic: (r, g, b) => {
    const y = luma(r, g, b);
    const [sr, sg, sb] = saturate(r, g, b, 0.85);
    const shadow = 1 - y;
    return [curve(sr + 0.06 * y - 0.03 * shadow, 0.45), curve(sg + 0.015 * y + 0.01 * shadow, 0.45), curve(sb - 0.05 * y + 0.05 * shadow, 0.45)];
  },
  // Soft and luminous: lifted shadows, low contrast, a warm rosy bloom.
  glow: (r, g, b) => {
    const soft = (v) => 0.06 + v * 0.92 - 0.12 * (v - 0.5) * (1 - Math.abs(2 * v - 1));
    const [sr, sg, sb] = saturate(r, g, b, 1.05);
    return [soft(sr) + 0.025, soft(sg) + 0.008, soft(sb) + 0.012];
  },
  // Glass skin, tuned for deeper skin tones. It never lifts the shadows (that
  // is what greys deep skin) and never pulls colour towards grey. Light goes
  // up only on the upper mid-tones, where cheekbones and the bridge of the
  // nose catch it, by scaling each pixel's own colour, so hue and richness
  // ride along with it. Colour is topped up where it is thin (vibrance, not
  // saturation), and a hair of warmth keeps skin from ever going cool.
  enhance: (r, g, b) => enhanceSkin(r, g, b),
  // Black and white with depth: true luminance on a contrast curve.
  bw: (r, g, b) => {
    const y = curve(luma(r, g, b), 0.35);
    return [y, y, y];
  },
};

// The Brightness and Contrast curve (src/calls/beauty.js toneOf), steps
// -10..10 each. Brightness is a gamma: at +10 the mids come up about two
// stops while black stays black and white stays white. Contrast pivots on
// mid grey: +10 more than doubles the spread, -10 flattens it to under half.
const TONE_STEPS = 10;
export function tone(v, brightness, contrast) {
  const b = brightness / TONE_STEPS;
  const c = contrast / TONE_STEPS;
  const lit = b === 0 ? v : Math.pow(clamp(v), Math.pow(2, -1.3 * b));
  return c === 0 ? lit : clamp(0.5 + (lit - 0.5) * Math.pow(2, 1.25 * c));
}

/** A .cube file from a colour function: red changes fastest, as the Cube LUT format says. */
function cubeText(title, fn, digits = 6) {
  const n = LUT_SIZE;
  const lines = [`TITLE "${title}"`, `LUT_3D_SIZE ${n}`, 'DOMAIN_MIN 0.0 0.0 0.0', 'DOMAIN_MAX 1.0 1.0 1.0'];
  for (let bi = 0; bi < n; bi++) {
    for (let gi = 0; gi < n; gi++) {
      for (let ri = 0; ri < n; ri++) {
        const [r, g, b] = fn(ri / (n - 1), gi / (n - 1), bi / (n - 1));
        lines.push(`${clamp(r).toFixed(digits)} ${clamp(g).toFixed(digits)} ${clamp(b).toFixed(digits)}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

/** The .cube file for a grade. */
export function lutText(id) {
  const grade = GRADES[id];
  if (!grade) throw new Error(`No grade ${id}`);
  return cubeText(`BOA ${id}`, grade);
}

/**
 * The .cube file for a grade (or none) at a strength, with the tone curve
 * on top. The strength is mixed in here, so Agora applies it at full and
 * the tone curve is never watered down by the grade's strength.
 */
export function toneLutText(id, strength, brightness, contrast) {
  const grade = id ? GRADES[id] : null;
  if (id && !grade) throw new Error(`No grade ${id}`);
  const s = grade ? strength : 0;
  const mix = (a, b) => a + (b - a) * s;
  return cubeText(
    `BOA ${id || 'tone'} b${brightness} c${contrast}`,
    (r, g, b) => {
      const [gr, gg, gb] = grade ? grade(r, g, b) : [r, g, b];
      return [tone(mix(r, gr), brightness, contrast), tone(mix(g, gg), brightness, contrast), tone(mix(b, gb), brightness, contrast)];
    },
    4,
  );
}

const paths = new Map();

// Written to the cache the first time, then reused: the plain absolute path Agora wants.
function cached(key, text) {
  if (paths.has(key)) return paths.get(key);
  const dir = new Directory(Paths.cache, 'boa-luts');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `${key}-v${VERSION}.cube`);
  if (!file.exists || !file.size) {
    if (!file.exists) file.create();
    file.write(text());
  }
  const path = decodeURIComponent(file.uri.replace(/^file:\/\//, ''));
  paths.set(key, path);
  return path;
}

/** The grade's .cube file on the phone. */
export const lutPath = (id) => cached(id, () => lutText(id));

/** A grade (or null) at a strength with Brightness and Contrast steps on top (toneLutText), on the phone. */
export function toneLutPath(id, strength, brightness, contrast) {
  const s = id ? Math.round(strength * 100) : 0;
  return cached(`${id || 'tone'}-s${s}-b${brightness}-c${contrast}`, () => toneLutText(id, strength, brightness, contrast));
}
