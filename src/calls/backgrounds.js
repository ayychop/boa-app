// BOA Backdrops: what's behind you on a video call. Three kinds, picked in
// the call's Background sheet (src/components/calls/CallScreen.js):
//
//   - Studio: a seamless photography backdrop in one tone. Not a flat fill:
//     each is a lit paper sweep (scripts/studio-backdrops.py), with a pool of
//     light behind your head falling off to the edges, faint canvas mottle
//     and fine grain, so it reads as a real studio wall.
//   - Scenes: a full photograph behind you (SCENES, added as assets arrive).
//   - Blur: your own room, out of focus, at three depths named like a lens.
//
// Two engines draw it, both cutting you out with AI segmentation of the
// person, never a chroma key (src/calls/media.native.js):
//   - Banuba Face AR (its Agora extension), when the build has a Banuba
//     client token: its contour-smoothing filter keeps hair and edges soft.
//   - Agora's own virtual background otherwise, with its AI model.
// This file is the shared description of each choice, for either engine.

export const STUDIO = [
  { id: 'black', label: 'All Black', detail: 'Seamless black, no edges', hex: '#000000', asset: require('../../assets/backdrops/black.jpg') },
  { id: 'charcoal', label: 'Charcoal', detail: 'Soft key light on deep grey', hex: '#1A1A1A', asset: require('../../assets/backdrops/charcoal.jpg') },
  { id: 'warm-grey', label: 'Warm Grey', detail: 'Classic portrait paper', hex: '#6E675F', asset: require('../../assets/backdrops/warm-grey.jpg') },
];

// High-resolution scene photographs: { id, label, detail, asset, thumb }.
// Add an entry per image (asset: require('../../assets/scenes/<name>.jpg'),
// at least 1920 px on the long side); the Scenes carousel shows each one.
export const SCENES = [];

// Depth of field, named like a lens: the wider the aperture, the softer the room.
// agora: Agora's blur degree (1 low .. 3 high). banuba: Banuba's blur radius (0..1).
export const BLURS = [
  { id: 'f4', label: 'f/4', detail: 'A hint of depth', agora: 1, banuba: 0.35 },
  { id: 'f2.8', label: 'f/2.8', detail: 'Portrait lens', agora: 2, banuba: 0.6 },
  { id: 'f1.4', label: 'f/1.4', detail: 'Wide open, creamy', agora: 3, banuba: 0.9 },
];

export const MODES = ['off', 'studio', 'scene', 'blur'];
export const DEFAULT_BACKGROUND = Object.freeze({ mode: 'off', id: null });

const LISTS = { studio: STUDIO, scene: SCENES, blur: BLURS };

/** The chosen studio tone, scene or blur, or null (off, or no longer offered). */
export function choiceOf(bg) {
  const list = LISTS[bg?.mode];
  return list?.find((c) => c.id === bg.id) ?? null;
}

/** Saved settings, made safe: anything unknown (a scene since removed) is off. */
export function fromStored(raw) {
  const bg = raw && typeof raw === 'object' ? { mode: raw.mode, id: raw.id } : null;
  return bg && MODES.includes(bg.mode) && bg.mode !== 'off' && choiceOf(bg) ? bg : { ...DEFAULT_BACKGROUND };
}

/** '#1A1A1A' as Agora's colour number, 0x1A1A1A. */
export function hexToInt(hex) {
  const n = parseInt(String(hex ?? '').replace('#', ''), 16);
  return Number.isFinite(n) ? Math.max(0, Math.min(0xffffff, n)) : 0;
}

/** The image a choice needs on the phone (a studio sweep or a scene), or null. */
export function assetOf(bg) {
  const c = choiceOf(bg);
  return bg?.mode === 'studio' || bg?.mode === 'scene' ? (c?.asset ?? null) : null;
}

// Agora's enum values (react-native-agora AgoraBase), as plain numbers so this loads anywhere.
const AGORA_SOURCE = { color: 1, image: 2, blur: 3 }; // BackgroundColor, BackgroundImg, BackgroundBlur
const AGORA_AI = 1; // SegModelAi: the person, found by AI, not by a green screen

/**
 * Agora's enableVirtualBackground arguments for a choice:
 * { enabled, source, segmentation }. path: the choice's image as an
 * absolute path on the phone. A studio tone always carries its colour too,
 * so if the image can't be read Agora still lays the tone down.
 */
export function toAgora(bg, path) {
  const c = choiceOf(bg);
  const segmentation = { modelType: AGORA_AI };
  if (!c || bg.mode === 'off') return { enabled: false, source: { background_source_type: AGORA_SOURCE.color }, segmentation };
  if (bg.mode === 'blur') return { enabled: true, source: { background_source_type: AGORA_SOURCE.blur, blur_degree: c.agora }, segmentation };
  const color = bg.mode === 'studio' ? hexToInt(c.hex) : 0x000000;
  if (!path) return { enabled: true, source: { background_source_type: AGORA_SOURCE.color, color }, segmentation };
  return { enabled: true, source: { background_source_type: AGORA_SOURCE.image, color, source: path }, segmentation };
}

// A path made safe inside a single-quoted JavaScript string for Banuba.
const quoted = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * The scripts Banuba runs (its eval_js property) to draw a choice, after
 * BOA's background effect (effects/BOABackground) is loaded. Empty when off.
 */
export function toBanuba(bg, path) {
  const c = choiceOf(bg);
  if (!c || bg.mode === 'off') return [];
  const out = ["Background = require('bnb_js/background')"];
  if (bg.mode === 'blur') out.push(`Background.blur(${c.banuba})`);
  else if (path) out.push(`Background.texture(${quoted(path)})`, "Background.contentMode('scale_to_fill')");
  return out;
}

/** A short line for the sheet and the self view: "Studio · Charcoal", "Blur · f/2.8", or "Off". */
export function describe(bg) {
  const c = choiceOf(bg);
  if (!c) return 'Off';
  const kind = bg.mode === 'studio' ? 'Studio' : bg.mode === 'scene' ? 'Scene' : 'Blur';
  return `${kind} · ${c.label}`;
}
