// BOA Studio: the in-call look. Six presets for skin and glow, and the
// Brightness and Contrast sliders. All of it runs in Agora's own video pipeline on the
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
// Brightness is the camera's own exposure (setCameraExposureFactor): the
// sensor takes in more or less light, so the picture brightens or darkens
// like a phone camera's exposure dial, not a filter over it. The middle is
// Auto (the camera's own exposure). On a camera that can't take an
// exposure setting, Brightness falls back to Agora's lightening.
// Brightness and Contrast also run through a tone curve baked into the
// grade's LUT (src/calls/luts.js toneLutPath): a camera's exposure range
// can be small, but the curve always shows, so the picture changes the
// moment a slider moves.
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
    lift: 0.4,
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
    lift: 0.6,
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
    lift: 0.4,
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
    lift: 0.15,
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
    lift: 0.7,
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
    lift: 0.3,
    colour: 0,
    grade: { lut: 'bw', strength: 1 },
  },
];

export const presetById = (id) => PRESETS.find((p) => p.id === id) ?? PRESETS[0];

// Brightness 0.5 is Auto: the camera's own exposure. Contrast 0.5 is the camera's own.
export const DEFAULT_BEAUTY = Object.freeze({ preset: 'natural', brightness: 0.5, contrast: 0.5, enabled: true });
// Saved settings carry this; before it, brightness meant lightening, not exposure.
export const BEAUTY_VERSION = 2;

// The most each setting is ever allowed to do, whatever the preset or
// slider says: beyond these, faces start to look plastic, ashy or washed out.
export const MAX_SMOOTHNESS = 0.5;
export const MAX_REDNESS = 0.3;
export const MAX_LIGHTENING = 0.5;
export const MAX_SHARPNESS = 0.8;
export const MAX_SATURATION = 0.7;
// Exposure at the slider's ends, in Agora's units (Android takes -20..20,
// iOS -8..8; the SDK clamps to what each camera can do). The full range on
// purpose: the slider should visibly brighten a dim room.
export const MAX_EXPOSURE = { android: 20, ios: 8 };
// The tone curve's slider steps either side of the middle: each step is a
// LUT written once and kept, so 10 a side keeps dragging quick.
export const TONE_STEPS = 10;

const unit = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const round = (v) => Math.round(v * 100) / 100;

/**
 * Saved settings, brought up to date. Brightness saved before it became
 * exposure (no version) meant something else, so it starts again on Auto.
 */
export function fromStored(raw) {
  const saved = raw && typeof raw === 'object' ? raw : {};
  const next = { ...DEFAULT_BEAUTY };
  if (PRESETS.some((p) => p.id === saved.preset)) next.preset = saved.preset;
  if (saved.v === BEAUTY_VERSION && saved.brightness != null) next.brightness = unit(saved.brightness);
  if (saved.contrast != null) next.contrast = unit(saved.contrast);
  if (typeof saved.enabled === 'boolean') next.enabled = saved.enabled;
  return next;
}

/** What's saved: the settings and the version they're in. */
export const toStored = (beauty) => ({
  preset: beauty.preset,
  brightness: beauty.brightness,
  contrast: beauty.contrast ?? DEFAULT_BEAUTY.contrast,
  enabled: beauty.enabled,
  v: BEAUTY_VERSION,
});

/**
 * Brightness as the camera's exposure factor: 0 at Auto (0.5), up to
 * MAX_EXPOSURE either way. The curve is steeper than straight near the
 * middle, so even a small drag reaches the camera as a real change.
 */
export function exposureOf(brightness = DEFAULT_BEAUTY.brightness, os = 'android') {
  const d = (unit(brightness) - 0.5) * 2;
  const max = MAX_EXPOSURE[os] ?? MAX_EXPOSURE.android;
  return round(Math.sign(d) * Math.pow(Math.abs(d), 0.8) * max);
}

// A slider (0..1, 0.5 in the middle) as -100..100.
const signed = (v) => Math.round((unit(v) - 0.5) * 200);

/** "Auto", "+40" or "-25": Brightness as the slider shows it. */
export function brightnessLabel(brightness = DEFAULT_BEAUTY.brightness) {
  const d = signed(brightness);
  return d === 0 ? 'Auto' : `${d > 0 ? '+' : ''}${d}`;
}

/** "Normal", "+40" or "-25": Contrast as the slider shows it. */
export function contrastLabel(contrast = DEFAULT_BEAUTY.contrast) {
  const d = signed(contrast);
  return d === 0 ? 'Normal' : `${d > 0 ? '+' : ''}${d}`;
}

/**
 * Brightness and Contrast as tone curve steps, -TONE_STEPS..TONE_STEPS
 * each (0 is no curve). Any slider move off the middle is at least one
 * step, so it always shows.
 */
export function toneOf({ brightness = DEFAULT_BEAUTY.brightness, contrast = DEFAULT_BEAUTY.contrast } = {}) {
  const step = (v) => {
    const d = (unit(v) - 0.5) * 2;
    if (Math.abs(d) < 0.005) return 0;
    return Math.sign(d) * Math.max(1, Math.round(Math.abs(d) * TONE_STEPS));
  };
  return { brightness: step(brightness), contrast: step(contrast) };
}

/**
 * Agora's options for a look: { beauty, colorEnhance, filter, exposure, tone }.
 * tone (toneOf) is drawn into the LUT with the grade, filters on or off.
 * Off (enabled false), every filter is off, but Brightness stays where you
 * left it: it's the camera's exposure, not a filter. Skin protection is always full. exposure: false (a camera that can't
 * take an exposure setting) moves Brightness into the lightening instead.
 */
export function toAgora({ preset, brightness = DEFAULT_BEAUTY.brightness, contrast = DEFAULT_BEAUTY.contrast, enabled = true } = {}, { os = 'android', exposure = true } = {}) {
  const p = presetById(preset);
  const on = !!enabled;
  // Without exposure, Brightness above Auto becomes lightening: on top of
  // the preset's own, or, with filters off, the only thing switched on.
  const extra = !exposure ? Math.max(0, unit(brightness) - 0.5) * 2 * (1 - (on ? p.lift : 0)) : 0;
  if (!on && extra > 0) {
    return {
      tone: toneOf({ brightness, contrast }),
      exposure: { factor: 0 },
      beauty: { enabled: true, lighteningContrastLevel: 1, lighteningLevel: round(extra * MAX_LIGHTENING), smoothnessLevel: 0, rednessLevel: 0, sharpnessLevel: 0 },
      colorEnhance: { enabled: false, strengthLevel: 0, skinProtectLevel: 1.0 },
      filter: { enabled: false, lut: null, strength: 0 },
    };
  }
  return {
    tone: toneOf({ brightness, contrast }),
    exposure: { factor: exposure ? exposureOf(brightness, os) : 0 },
    beauty: {
      enabled: on,
      lighteningContrastLevel: on ? p.contrast : 1,
      lighteningLevel: on ? round((p.lift + extra) * MAX_LIGHTENING) : 0,
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

/** A short line under the call controls: "Golden · Bright +40". */
export function describe(beauty) {
  return describeParts(beauty)
    .map((p) => (p.value == null ? p.label : `${p.label} ${p.value}`))
    .join(' · ');
}

/** The same as chips: the preset, Brightness, then Contrast once it's moved. */
export function describeParts(beauty) {
  if (!beauty?.enabled) return [{ id: 'off', label: 'Filters off', value: null }];
  const parts = [
    { id: 'preset', label: presetById(beauty.preset).label, value: null },
    { id: 'brightness', label: 'Bright', value: brightnessLabel(beauty.brightness) },
  ];
  if (signed(beauty.contrast ?? DEFAULT_BEAUTY.contrast) !== 0) parts.push({ id: 'contrast', label: 'Contrast', value: contrastLabel(beauty.contrast) });
  return parts;
}
