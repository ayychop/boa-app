// BOA's in-call beauty filters, made for melanin-rich skin first.
//
// Most beauty filters "beautify" by lightening and desaturating: they lift
// shadows, push skin towards pink and flatten deep tones until darker skin
// looks grey or ashy. These two keep every change small and protect skin
// hues while they work:
//
//   Skin Smoothing: softens texture (pores, compression noise) with an
//     edge-preserving blur, so features and hairlines stay sharp, with a
//     touch of healthy colour. Redness is capped well below Agora's range,
//     because a strong correction turns deep skin grey.
//   Tone Enhancer: brings back the warmth and richness that phone cameras
//     strip from deep skin under cool or dim light: a saturation and warmth
//     lift with skin protection at full, so the lift lands on the room and
//     clothes and skin stays its own colour, never orange. High contrast
//     keeps depth in the shadows, and the faint glow it adds is capped so
//     skin is never washed out.
//
// The strengths (0 to 1) live in the call's state; toAgora() turns them into
// the options Agora's video SDK takes (setBeautyEffectOptions and
// setColorEnhanceOptions).

export const FILTERS = [
  {
    id: 'smoothing',
    label: 'Skin Smoothing',
    detail: 'Softens texture, keeps every feature sharp',
    icon: 'water-outline',
  },
  {
    id: 'tone',
    label: 'Tone Enhancer',
    detail: 'Rich and warm, a soft glow. Your skin keeps its colour.',
    icon: 'sunny-outline',
  },
];

export const DEFAULT_BEAUTY = Object.freeze({ smoothing: 0.5, tone: 0.5, enabled: true });

// The most each filter is ever allowed to do, whatever the slider says:
// beyond these, deep skin starts to look plastic, ashy or washed out.
export const MAX_SMOOTHNESS = 0.5;
export const MAX_REDNESS = 0.3;
export const MAX_LIGHTENING = 0.15;
const MAX_STRENGTH = 0.45;
const CONTRAST_HIGH = 2; // LighteningContrastHigh: deep shadows keep their depth

const unit = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const round = (v) => Math.round(v * 100) / 100;

/**
 * Agora's options for these strengths. Lightening follows Tone and never
 * passes MAX_LIGHTENING: brightness comes from the camera's exposure, the
 * filter only adds a glow. Skin protection is always full.
 */
export function toAgora({ smoothing = 0, tone = 0, enabled = true } = {}) {
  const s = enabled ? unit(smoothing) : 0;
  const t = enabled ? unit(tone) : 0;
  return {
    beauty: {
      enabled: s > 0 || t > 0,
      lighteningContrastLevel: CONTRAST_HIGH,
      lighteningLevel: round(t * MAX_LIGHTENING),
      smoothnessLevel: round(s * MAX_SMOOTHNESS),
      rednessLevel: round(s * MAX_REDNESS),
      sharpnessLevel: round(0.2 + s * 0.2), // keeps edges crisp under smoothing
    },
    colorEnhance: {
      enabled: t > 0,
      strengthLevel: round(t * MAX_STRENGTH),
      skinProtectLevel: 1.0, // skin keeps its hue while the rest is enriched
    },
  };
}

/** A short line for the filter button: "Smoothing 40% · Tone 35%". */
export function describe({ smoothing, tone, enabled }) {
  if (!enabled || (!(smoothing > 0) && !(tone > 0))) return 'Filters off';
  const parts = [];
  if (smoothing > 0) parts.push(`Smoothing ${Math.round(smoothing * 100)}%`);
  if (tone > 0) parts.push(`Tone ${Math.round(tone * 100)}%`);
  return parts.join(' · ');
}
