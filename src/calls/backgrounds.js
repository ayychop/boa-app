// BOA Blur: what's behind you on a video call. One choice, picked in the
// call's Blur sheet (src/components/calls/CallScreen.js): your own room, out
// of focus, at three depths named like a lens.
//
// (Studio tones and Scenes, which swapped the room for a picture, are gone:
// a backdrop picture needs a clean chroma key or a very good cut-out, and
// the cut-out wasn't good enough. Blur only needs the person found, which
// works.)
//
// Two engines draw it, both finding you with AI segmentation of the person,
// never a chroma key (src/calls/media.native.js):
//   - Banuba Face AR (its Agora extension), when the build has a Banuba
//     client token: its contour-smoothing filter keeps hair and edges soft.
//   - Agora's own virtual background otherwise, with its AI model.
// This file is the shared description of each choice, for either engine.

// Depth of field, named like a lens: the wider the aperture, the softer the room.
// agora: Agora's blur degree (1 low .. 3 high). banuba: Banuba's blur radius (0..1).
export const BLURS = [
  { id: 'f4', label: 'f/4', detail: 'A hint of depth', agora: 1, banuba: 0.35 },
  { id: 'f2.8', label: 'f/2.8', detail: 'Portrait lens', agora: 2, banuba: 0.6 },
  { id: 'f1.4', label: 'f/1.4', detail: 'Wide open, creamy', agora: 3, banuba: 0.9 },
];

export const MODES = ['off', 'blur'];
export const DEFAULT_BACKGROUND = Object.freeze({ mode: 'off', id: null });

/** The chosen blur, or null (off, or no longer offered). */
export function choiceOf(bg) {
  return bg?.mode === 'blur' ? (BLURS.find((c) => c.id === bg.id) ?? null) : null;
}

/**
 * Saved settings, made safe: anything unknown is off. A studio or scene
 * backdrop saved by an earlier version is off too, since they were removed.
 */
export function fromStored(raw) {
  const bg = raw && typeof raw === 'object' ? { mode: raw.mode, id: raw.id } : null;
  return bg && bg.mode === 'blur' && choiceOf(bg) ? bg : { ...DEFAULT_BACKGROUND };
}

// Agora's enum values (react-native-agora AgoraBase), as plain numbers so this loads anywhere.
const AGORA_SOURCE = { color: 1, blur: 3 }; // BackgroundColor, BackgroundBlur
const AGORA_AI = 1; // SegModelAi: the person, found by AI, not by a green screen

/**
 * Agora's enableVirtualBackground arguments for a choice:
 * { enabled, source, segmentation }.
 */
export function toAgora(bg) {
  const c = choiceOf(bg);
  const segmentation = { modelType: AGORA_AI };
  if (!c) return { enabled: false, source: { background_source_type: AGORA_SOURCE.color }, segmentation };
  return { enabled: true, source: { background_source_type: AGORA_SOURCE.blur, blur_degree: c.agora }, segmentation };
}

/**
 * The scripts Banuba runs (its eval_js property) to draw a choice, after
 * BOA's background effect (effects/BOABackground) is loaded. Empty when off.
 */
export function toBanuba(bg) {
  const c = choiceOf(bg);
  if (!c) return [];
  return ["Background = require('bnb_js/background')", `Background.blur(${c.banuba})`];
}

/** A short line for the sheet: "Blur · f/2.8", or "Off". */
export function describe(bg) {
  const c = choiceOf(bg);
  return c ? `Blur · ${c.label}` : 'Off';
}
