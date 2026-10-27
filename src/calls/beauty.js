// BOA Studio: the in-call filters. Every slider drives Agora's own video
// pipeline on the phone (setBeautyEffectOptions and setColorEnhanceOptions,
// applied to the camera's frames before they're encoded), never a view laid
// over the picture, so what you set is what the other person receives.
//
//   Brightness: lighteningLevel, a gentle key light.
//   Smooth Skin: smoothnessLevel, softens pores and compression noise.
//   Tone: rednessLevel, a light, healthy flush of colour.
//   Clarity: sharpnessLevel plus Agora's contrast level, so fine detail
//     (tattoos, hairlines, fabric, jewellery) stays crisp under smoothing.
//   Saturation: Agora's colour enhancement strength, richer colour in the
//     room and clothes, with skin protection at full so skin keeps its hue.
//
// Every strength is capped (the MAX_ values) inside Agora's range, so no
// slider position can wash a face out or turn it plastic.
//
// The strengths (0 to 1) live in the call's state; toAgora() turns them into
// the options Agora's video SDK takes.

export const FILTERS = [
  { id: 'studio', label: 'Brightness', detail: 'A soft key light on your face', icon: 'sunny-outline' },
  { id: 'flawless', label: 'Smooth Skin', detail: 'Softens texture, keeps your features', icon: 'diamond-outline' },
  { id: 'glow', label: 'Tone', detail: 'A light, healthy flush', icon: 'sparkles-outline' },
  { id: 'clarity', label: 'Clarity', detail: 'Fine detail and tattoos stay sharp', icon: 'aperture-outline' },
  { id: 'saturation', label: 'Saturation', detail: 'Richer colour. Your skin stays yours.', icon: 'color-palette-outline' },
];

export const DEFAULT_BEAUTY = Object.freeze({ studio: 0.4, flawless: 0.3, glow: 0.3, clarity: 0.6, saturation: 0.5, enabled: true });

// The most each filter is ever allowed to do, whatever the slider says:
// beyond these, faces start to look plastic, ashy or washed out.
export const MAX_SMOOTHNESS = 0.5;
export const MAX_REDNESS = 0.3;
export const MAX_LIGHTENING = 0.2;
export const MAX_SHARPNESS = 0.8;
export const MAX_SATURATION = 0.7;
const BASE_SHARPNESS = 0.1;
const CONTRAST_NORMAL = 1; // LighteningContrastNormal
const CONTRAST_HIGH = 2; // LighteningContrastHigh: shadows keep their depth

const unit = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const round = (v) => Math.round(v * 100) / 100;

/**
 * Saved settings, brought up to date: "smoothing" became Smooth Skin
 * (flawless), and the old Tone Enhancer (tone) drove colour enhancement,
 * which is Saturation now.
 */
export function fromStored(raw) {
  const saved = raw && typeof raw === 'object' ? raw : {};
  const next = { ...DEFAULT_BEAUTY };
  for (const f of FILTERS) if (saved[f.id] != null) next[f.id] = unit(saved[f.id]);
  if (saved.flawless == null && saved.smoothing != null) next.flawless = unit(saved.smoothing);
  if (saved.saturation == null && saved.tone != null) next.saturation = unit(saved.tone);
  if (typeof saved.enabled === 'boolean') next.enabled = saved.enabled;
  return next;
}

/** Agora's options for these strengths. Skin protection is always full. */
export function toAgora({ studio = 0, flawless = 0, glow = 0, clarity = 0, saturation = 0, enabled = true } = {}) {
  const on = (v) => (enabled ? unit(v) : 0);
  const [l, s, g, c, sat] = [on(studio), on(flawless), on(glow), on(clarity), on(saturation)];
  return {
    beauty: {
      enabled: l > 0 || s > 0 || g > 0 || c > 0,
      lighteningContrastLevel: c >= 0.5 ? CONTRAST_HIGH : CONTRAST_NORMAL,
      lighteningLevel: round(l * MAX_LIGHTENING),
      smoothnessLevel: round(s * MAX_SMOOTHNESS),
      rednessLevel: round(g * MAX_REDNESS),
      // A floor of sharpening whenever smoothing is on, so it never softens edges.
      sharpnessLevel: round(Math.min(MAX_SHARPNESS, (s > 0 ? BASE_SHARPNESS : 0) + c * (MAX_SHARPNESS - BASE_SHARPNESS))),
    },
    colorEnhance: {
      enabled: sat > 0,
      strengthLevel: round(sat * MAX_SATURATION),
      skinProtectLevel: 1.0, // skin keeps its hue while the rest is enriched
    },
  };
}

/** A short line under the call controls: "Bright 40% · Smooth 30% · Clarity 60%". */
const SHORT = { studio: 'Bright', flawless: 'Smooth', glow: 'Tone', clarity: 'Clarity', saturation: 'Colour' };
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
