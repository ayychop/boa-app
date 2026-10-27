// BOA Studio: the in-call look. Six presets for skin and glow, and one
// Brightness slider. All of it runs in Agora's own video pipeline on the
// phone (the Clear Vision extension, switched on in src/calls/media), on
// the camera's frames before they're encoded: never a view laid over the
// picture, so what you see is what the other person receives.
//
// A preset is three things at once:
//   - Agora's beauty options: smoothing, a flush of colour, sharpening and
//     the contrast curve.
//   - Colour enhancement: richer colour, with skin protection at full.
//   - A colour grade: a Cube LUT (src/calls/luts.js) for the looks the
//     beauty options can't make (warm gold, teal and orange film, black
//     and white).
// Brightness is Agora's lightening, on top of whichever preset is on.
//
// Every strength is capped (the MAX_ values) inside Agora's range, so no
// preset or slider position can wash a face out or turn it plastic.

export const PRESETS = [
  {
    id: 'natural',
    label: 'Natural',
    detail: 'You, just clearer',
    icon: 'leaf-outline',
    smooth: 0.3,
    flush: 0.15,
    sharp: 0.35,
    contrast: 1,
    colour: 0.2,
    grade: null,
  },
  {
    id: 'studio',
    label: 'Studio',
    detail: 'Clean key light, crisp detail',
    icon: 'aperture-outline',
    smooth: 0.6,
    flush: 0.2,
    sharp: 0.55,
    contrast: 2,
    colour: 0.3,
    grade: { lut: 'studio', strength: 0.6 },
  },
  {
    id: 'golden',
    label: 'Golden',
    detail: 'Warm sunset skin',
    icon: 'sunny-outline',
    smooth: 0.5,
    flush: 0.35,
    sharp: 0.35,
    contrast: 1,
    colour: 0.45,
    grade: { lut: 'golden', strength: 0.75 },
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    detail: 'Teal shadows, orange light, deep contrast',
    icon: 'film-outline',
    smooth: 0.4,
    flush: 0.1,
    sharp: 0.6,
    contrast: 2,
    colour: 0.15,
    grade: { lut: 'cinematic', strength: 0.85 },
  },
  {
    id: 'glow',
    label: 'Glow',
    detail: 'Soft, luminous, rosy',
    icon: 'sparkles-outline',
    smooth: 0.85,
    flush: 0.6,
    sharp: 0.2,
    contrast: 0,
    colour: 0.35,
    grade: { lut: 'glow', strength: 0.7 },
  },
  {
    id: 'bw',
    label: 'B&W',
    detail: 'Black and white with depth',
    icon: 'contrast-outline',
    smooth: 0.4,
    flush: 0,
    sharp: 0.6,
    contrast: 2,
    colour: 0,
    grade: { lut: 'bw', strength: 1 },
  },
];

export const presetById = (id) => PRESETS.find((p) => p.id === id) ?? PRESETS[0];

export const DEFAULT_BEAUTY = Object.freeze({ preset: 'natural', brightness: 0.4, enabled: true });

// The most each setting is ever allowed to do, whatever the preset or
// slider says: beyond these, faces start to look plastic, ashy or washed out.
export const MAX_SMOOTHNESS = 0.5;
export const MAX_REDNESS = 0.3;
export const MAX_LIGHTENING = 0.5;
export const MAX_SHARPNESS = 0.8;
export const MAX_SATURATION = 0.7;

const unit = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const round = (v) => Math.round(v * 100) / 100;

/**
 * Saved settings, brought up to date. The old sliders are gone: their
 * brightness (studio) carries over as Brightness, the rest starts on Natural.
 */
export function fromStored(raw) {
  const saved = raw && typeof raw === 'object' ? raw : {};
  const next = { ...DEFAULT_BEAUTY };
  if (PRESETS.some((p) => p.id === saved.preset)) next.preset = saved.preset;
  if (saved.brightness != null) next.brightness = unit(saved.brightness);
  else if (saved.studio != null) next.brightness = unit(saved.studio);
  if (typeof saved.enabled === 'boolean') next.enabled = saved.enabled;
  return next;
}

/**
 * Agora's options for a look: { beauty, colorEnhance, filter }. Off
 * (enabled false), everything is off. Skin protection is always full.
 */
export function toAgora({ preset, brightness = DEFAULT_BEAUTY.brightness, enabled = true } = {}) {
  const p = presetById(preset);
  const on = !!enabled;
  return {
    beauty: {
      enabled: on,
      lighteningContrastLevel: on ? p.contrast : 1,
      lighteningLevel: on ? round(unit(brightness) * MAX_LIGHTENING) : 0,
      smoothnessLevel: on ? round(p.smooth * MAX_SMOOTHNESS) : 0,
      rednessLevel: on ? round(p.flush * MAX_REDNESS) : 0,
      sharpnessLevel: on ? round(p.sharp * MAX_SHARPNESS) : 0,
    },
    colorEnhance: {
      enabled: on && p.colour > 0,
      strengthLevel: on ? round(p.colour * MAX_SATURATION) : 0,
      skinProtectLevel: 1.0, // skin keeps its hue while the rest is enriched
    },
    filter: on && p.grade ? { enabled: true, lut: p.grade.lut, strength: p.grade.strength } : { enabled: false, lut: null, strength: 0 },
  };
}

/** A short line under the call controls: "Golden · Bright 40%". */
export function describe(beauty) {
  return describeParts(beauty)
    .map((p) => (p.value == null ? p.label : `${p.label} ${p.value}`))
    .join(' · ');
}

/** The same as chips: the preset, then Brightness. */
export function describeParts(beauty) {
  if (!beauty?.enabled) return [{ id: 'off', label: 'Filters off', value: null }];
  return [
    { id: 'preset', label: presetById(beauty.preset).label, value: null },
    { id: 'brightness', label: 'Bright', value: `${Math.round(unit(beauty.brightness ?? DEFAULT_BEAUTY.brightness) * 100)}%` },
  ];
}
