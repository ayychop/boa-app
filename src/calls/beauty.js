// BOA Studio: the in-call filters. Four soft, flattering adjustments, like a
// good studio light: everyone looks their best in any light, and nobody's
// complexion is ever washed out, greyed or turned orange.
//
//   Studio Lighting: a gentle key light. High contrast keeps depth in the
//     shadows while a small, capped lift brightens the face.
//   Flawless HD: softens texture (pores, compression noise) with an
//     edge-preserving blur, with a touch of sharpening so features and
//     hairlines stay crisp.
//   Tone Enhancer: brings back the warmth and richness phone cameras strip
//     out under cool or dim light, with skin protection at full so the lift
//     lands on the room and clothes and skin keeps its own colour.
//   Soft Glow: a light, healthy flush of colour.
//
// Every strength is capped (the MAX_ values) well inside Agora's range, so
// no slider position can wash a face out. Noise reduction runs on every
// frame underneath them all (DENOISER in src/calls/quality.js).
//
// The strengths (0 to 1) live in the call's state; toAgora() turns them into
// the options Agora's video SDK takes (setBeautyEffectOptions and
// setColorEnhanceOptions).

export const FILTERS = [
  { id: 'studio', label: 'Studio Lighting', detail: 'A soft key light that keeps your depth', icon: 'bulb-outline' },
  { id: 'flawless', label: 'Flawless HD', detail: 'Smooth skin, every feature sharp', icon: 'diamond-outline' },
  { id: 'tone', label: 'Tone Enhancer', detail: 'Rich, warm colour. Your skin stays yours.', icon: 'color-palette-outline' },
  { id: 'glow', label: 'Soft Glow', detail: 'A light, healthy flush', icon: 'sparkles-outline' },
];

export const DEFAULT_BEAUTY = Object.freeze({ studio: 0.5, flawless: 0.5, tone: 0.5, glow: 0.3, enabled: true });

// The most each filter is ever allowed to do, whatever the slider says:
// beyond these, faces start to look plastic, ashy or washed out.
export const MAX_SMOOTHNESS = 0.5;
export const MAX_REDNESS = 0.3;
export const MAX_LIGHTENING = 0.15;
const MAX_STRENGTH = 0.45;
const CONTRAST_HIGH = 2; // LighteningContrastHigh: shadows keep their depth

const unit = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const round = (v) => Math.round(v * 100) / 100;

/**
 * Saved settings, brought up to date: the first two filters were called
 * smoothing and tone, so an old "smoothing" becomes Flawless HD.
 */
export function fromStored(raw) {
  const saved = raw && typeof raw === 'object' ? raw : {};
  const next = { ...DEFAULT_BEAUTY };
  for (const f of FILTERS) if (saved[f.id] != null) next[f.id] = unit(saved[f.id]);
  if (saved.flawless == null && saved.smoothing != null) next.flawless = unit(saved.smoothing);
  if (typeof saved.enabled === 'boolean') next.enabled = saved.enabled;
  return next;
}

/** Agora's options for these strengths. Skin protection is always full. */
export function toAgora({ studio = 0, flawless = 0, tone = 0, glow = 0, enabled = true } = {}) {
  const on = (v) => (enabled ? unit(v) : 0);
  const [l, s, t, g] = [on(studio), on(flawless), on(tone), on(glow)];
  return {
    beauty: {
      enabled: l > 0 || s > 0 || g > 0,
      lighteningContrastLevel: CONTRAST_HIGH,
      lighteningLevel: round(l * MAX_LIGHTENING),
      smoothnessLevel: round(s * MAX_SMOOTHNESS),
      rednessLevel: round(g * MAX_REDNESS),
      sharpnessLevel: round(0.2 + s * 0.2), // keeps edges crisp under smoothing
    },
    colorEnhance: {
      enabled: t > 0,
      strengthLevel: round(t * MAX_STRENGTH),
      skinProtectLevel: 1.0, // skin keeps its hue while the rest is enriched
    },
  };
}

/** A short line under the call controls: "Studio 50% · HD 50% · Tone 50% · Glow 30%". */
const SHORT = { studio: 'Studio', flawless: 'HD', tone: 'Tone', glow: 'Glow' };
export function describe(beauty) {
  return describeParts(beauty)
    .map((p) => (p.value == null ? p.label : `${p.label} ${p.value}`))
    .join(' · ');
}

/** The same, one { id, label, value } per filter that's on, for laying out as chips. */
export function describeParts(beauty) {
  const on = beauty?.enabled ? FILTERS.filter((f) => beauty[f.id] > 0) : [];
  if (!on.length) return [{ id: 'off', label: 'Filters off', value: null }];
  return on.map((f) => ({ id: f.id, label: SHORT[f.id], value: `${Math.round(beauty[f.id] * 100)}%` }));
}
