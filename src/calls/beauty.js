// BOA's in-call beauty filters, made for melanin-rich skin first.
//
// Most beauty filters "beautify" by lightening and desaturating: they lift
// shadows, push skin towards pink and flatten deep tones until darker skin
// looks grey or ashy. These two never brighten the face and protect skin
// hues while they work:
//
//   Skin Smoothing: softens texture (pores, compression noise) with an
//     edge-preserving blur, so features and hairlines stay sharp. Lightening
//     is held at zero and redness correction stays low, because darker skin
//     reads redness differently and a strong correction turns it grey.
//   Tone Enhancer: brings back the warmth and richness that phone cameras
//     strip from deep skin under cool or dim light: a gentle saturation and
//     warmth lift with skin protection high, so the lift lands on the room
//     and clothes and skin stays its own colour, never orange.
//
// The strengths (0 to 1) live in the call's state; toAgora() turns them into
// the options Agora's video SDK takes (setBeautyEffectOptions and
// setColorEnhanceOptions) once calls carry real video.

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
    detail: 'Rich, warm, true to your skin. Never lighter.',
    icon: 'sunny-outline',
  },
];

export const DEFAULT_BEAUTY = Object.freeze({ smoothing: 0.4, tone: 0.35, enabled: true });

// The most each filter is ever allowed to do, whatever the slider says:
// beyond these, deep skin starts to look plastic or ashy.
const MAX_SMOOTHNESS = 0.7;
const MAX_REDNESS = 0.15;
const MAX_STRENGTH = 0.45;

const unit = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const round = (v) => Math.round(v * 100) / 100;

/**
 * Agora's options for these strengths. Lightening is always 0: brightness
 * comes from the camera's exposure, never from the filter.
 */
export function toAgora({ smoothing = 0, tone = 0, enabled = true } = {}) {
  const s = enabled ? unit(smoothing) : 0;
  const t = enabled ? unit(tone) : 0;
  return {
    beauty: {
      enabled: s > 0,
      lighteningContrastLevel: 1, // normal contrast: no flattening of deep tones
      lighteningLevel: 0,
      smoothnessLevel: round(s * MAX_SMOOTHNESS),
      rednessLevel: round(s * MAX_REDNESS),
      sharpnessLevel: round(0.2 + s * 0.2), // keeps edges crisp under smoothing
    },
    colorEnhance: {
      enabled: t > 0,
      strengthLevel: round(t * MAX_STRENGTH),
      skinProtectLevel: 1, // skin keeps its hue while the rest is enriched
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
