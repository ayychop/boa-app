import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { textOn } from './bubbleTheme';

const KEY = 'boa:chat-vibe:v1';
const CUSTOM_KEY = 'boa:chat-vibe-custom:v1';
const MOTION_KEY = 'boa:chat-motion:v1';

/** Motion: the backdrop lives (drifting light, a turning record, particles). Static: the same scene, held still. */
export const MOTION = 'motion';
export const STATIC = 'static';
const MODES = [MOTION, STATIC];

/**
 * The chat thread's looks, in the order the picker offers them. Each sets
 * the backdrop (a diagonal mesh of three tones, the drifting lights over it
 * and how bright the stars are), the glass of both kinds of bubble, the
 * header and composer glass, the text on their bubbles (theirsText), and
 * the accent the buttons and dots glow in. The mesh's middle tone stays
 * dark enough for white text; the colour lives in its corners and lights.
 */
const alpha = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const light = (id, color, size, x, y, opacity, ms) => ({ id, color, size, x, y, opacity, ms });
const DARK_TEXT = /^#(0|1|2)/;

// The later vibes share Noir's structure; this fills in what each doesn't
// set from its accent and bubble colours.
function vibe(v) {
  const darkText = DARK_TEXT.test(v.mineText);
  return {
    veil: 'rgba(5,5,6,0.18)',
    stars: { max: 0.35, deep: false },
    accentSoft: alpha(v.accent, 0.16),
    accentEdge: alpha(v.accent, 0.85),
    mineMeta: darkText ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.7)',
    mineEdge: 'rgba(255,255,255,0.75)',
    mineGlow: null,
    theirs: ['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.05)'],
    theirsFill: 'rgba(26,24,28,0.84)',
    theirsEdge: 'rgba(255,255,255,0.2)',
    theirsText: '#F3EFE8',
    theirsGlow: null,
    grain: true,
    bar: alpha(v.mesh[1], 0.75),
    send: [v.mine[0], v.mine[1], v.mine[2]],
    sendIcon: v.mineText,
    radius: null,
    // scene: what moves in the backdrop over the mesh and lights: drift
    // (the lights alone), turntable, stars, embers (rising dust) or rain.
    scene: 'drift',
    // light: a pale backdrop, so the header, composer and their-side text
    // flip to dark ink and the glass blurs light instead of dark.
    light: false,
    // ink: the colour of the UI chrome's text and icons (header name, back
    // arrow, composer field). White on the dark vibes, dark on a light one.
    ink: '#F3EFE8',
    // inkMuted: secondary text (status line, times on their bubbles).
    inkMuted: v.light ? 'rgba(17,17,19,0.58)' : 'rgba(243,239,232,0.6)',
    ...v,
  };
}

export const VIBES = [
  {
    id: 'noir',
    label: 'Noir',
    detail: 'Deep black, gold glass',
    mesh: ['#0C0B0D', '#07070A', '#0D0A06'],
    lights: [
      { id: 'a', color: '#E2A84B', size: 1.3, x: [0.12, 0.45], y: [0.08, 0.2], opacity: [0.28, 0.42], ms: 14000 },
      { id: 'b', color: '#8A4A16', size: 1.5, x: [0.85, 0.5], y: [0.8, 0.62], opacity: [0.2, 0.3], ms: 19000 },
      { id: 'c', color: '#1E1E24', size: 1.2, x: [0.95, 0.7], y: [0.36, 0.5], opacity: [0.2, 0.3], ms: 23000 },
    ],
    veil: 'rgba(3,3,4,0.3)',
    stars: { max: 0.3, deep: false },
    accent: '#E2A84B',
    accentSoft: 'rgba(226,168,75,0.16)',
    accentEdge: 'rgba(246,206,132,0.85)',
    mine: ['rgba(252,230,182,0.97)', 'rgba(232,180,96,0.94)', 'rgba(196,130,44,0.92)'],
    mineText: '#0B0906',
    mineMeta: 'rgba(11,9,6,0.58)',
    mineEdge: 'rgba(255,240,206,0.9)',
    mineGlow: null,
    theirs: ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.03)'],
    theirsFill: 'rgba(22,21,24,0.9)',
    theirsEdge: 'rgba(255,255,255,0.14)',
    theirsText: '#F3EFE8',
    bar: 'rgba(8,8,10,0.6)',
    send: ['#FBE3B0', '#E2A84B', '#C7862E'],
    sendIcon: '#0B0906',
    texture: null,
    scene: 'embers',
  },
  {
    id: 'neon',
    label: 'Neon',
    detail: 'Blue and violet mesh, glowing edges',
    mesh: ['#5221C9', '#16197A', '#0A55E6'],
    lights: [
      { id: 'a', color: '#9B6BFF', size: 1.6, x: [0.1, 0.45], y: [0.12, 0.3], opacity: [0.7, 0.95], ms: 13000 },
      { id: 'b', color: '#2F6BFF', size: 1.8, x: [0.9, 0.55], y: [0.8, 0.58], opacity: [0.65, 0.9], ms: 17000 },
      { id: 'c', color: '#00D4FF', size: 1.1, x: [0.95, 0.65], y: [0.4, 0.52], opacity: [0.35, 0.55], ms: 21000 },
    ],
    veil: 'rgba(6,6,30,0.12)',
    stars: { max: 0.45, deep: false },
    accent: '#8C9BFF',
    accentSoft: 'rgba(124,108,255,0.2)',
    accentEdge: 'rgba(160,170,255,0.9)',
    mine: ['rgba(130,90,245,0.97)', 'rgba(76,84,232,0.96)', 'rgba(20,130,220,0.95)'],
    mineText: '#FFFFFF',
    mineMeta: 'rgba(255,255,255,0.75)',
    mineEdge: 'rgba(200,190,255,0.95)',
    mineGlow: '0px 0px 16px rgba(120,100,255,0.65)',
    theirs: ['rgba(140,155,255,0.22)', 'rgba(140,155,255,0.06)'],
    theirsFill: 'rgba(18,14,72,0.86)',
    theirsEdge: 'rgba(150,165,255,0.55)',
    theirsText: '#ECEBFF',
    bar: 'rgba(14,12,60,0.75)',
    send: ['#C3A8FF', '#7B6CFF', '#2FA8FF'],
    sendIcon: '#FFFFFF',
    texture: null,
    scene: 'drift',
  },
  {
    id: 'midnight',
    label: 'Midnight Drive',
    detail: 'Deep navy under a starry sky',
    mesh: ['#1A2B5E', '#0B1434', '#050A1E'],
    lights: [
      { id: 'a', color: '#3D5FB8', size: 1.5, x: [0.15, 0.45], y: [0.08, 0.22], opacity: [0.45, 0.65], ms: 16000 },
      { id: 'b', color: '#1C2D6E', size: 1.8, x: [0.85, 0.55], y: [0.8, 0.62], opacity: [0.5, 0.7], ms: 21000 },
      { id: 'c', color: '#C9D6FF', size: 0.8, x: [0.9, 0.7], y: [0.3, 0.42], opacity: [0.16, 0.24], ms: 25000 },
    ],
    veil: 'rgba(4,8,24,0.1)',
    stars: { max: 1, deep: true },
    accent: '#C9D6FF',
    accentSoft: 'rgba(201,214,255,0.14)',
    accentEdge: 'rgba(214,224,255,0.85)',
    mine: ['rgba(236,242,255,0.97)', 'rgba(196,210,244,0.95)', 'rgba(150,168,218,0.94)'],
    mineText: '#0A1230',
    mineMeta: 'rgba(10,18,48,0.58)',
    mineEdge: 'rgba(255,255,255,0.9)',
    mineGlow: null,
    theirs: ['rgba(170,190,255,0.16)', 'rgba(170,190,255,0.04)'],
    theirsFill: 'rgba(14,24,62,0.86)',
    theirsEdge: 'rgba(170,190,255,0.3)',
    theirsText: '#FFFFFF',
    // Glowing white text on the deep navy, as the vibe promises.
    theirsGlow: '0px 0px 10px rgba(201,214,255,0.65)',
    bar: 'rgba(8,14,40,0.6)',
    send: ['#FFFFFF', '#C9D6FF', '#8EA2DA'],
    sendIcon: '#0A1230',
    texture: null,
    scene: 'stars',
  },
  vibe({
    id: 'turntable',
    label: 'Turntable',
    detail: 'A record turning slowly behind the chat',
    mesh: ['#22190F', '#0B0907', '#1C130B'],
    lights: [
      light('a', '#C98A3A', 1.3, [0.15, 0.45], [0.12, 0.26], [0.32, 0.5], 15000),
      light('b', '#7A3418', 1.5, [0.85, 0.55], [0.75, 0.6], [0.26, 0.4], 20000),
      light('c', '#3A2A1A', 1.1, [0.9, 0.7], [0.3, 0.45], [0.2, 0.32], 24000),
    ],
    accent: '#E8B866',
    mine: ['rgba(242,210,150,0.97)', 'rgba(218,166,88,0.95)', 'rgba(178,118,50,0.94)'],
    mineText: '#120D06',
    theirsFill: 'rgba(20,18,16,0.9)',
    stars: { max: 0, deep: false },
    texture: 'vinyl',
    scene: 'turntable',
  }),
  vibe({
    id: 'street-luxury',
    label: 'Street Luxury',
    detail: 'Dark charcoal with a gold sheen',
    mesh: ['#34302A', '#1C1B1A', '#5A4216'],
    lights: [
      light('a', '#E2A84B', 1.4, [0.1, 0.4], [0.1, 0.25], [0.35, 0.55], 15000),
      light('b', '#B07A28', 1.7, [0.9, 0.6], [0.8, 0.6], [0.4, 0.55], 19000),
      light('c', '#F3D9A4', 0.9, [0.85, 0.65], [0.3, 0.4], [0.16, 0.24], 23000),
    ],
    accent: '#F0C46A',
    mine: ['rgba(46,37,20,0.97)', 'rgba(32,26,14,0.96)', 'rgba(24,19,10,0.96)'],
    mineText: '#F6D38A',
    mineEdge: 'rgba(226,168,75,0.9)',
    mineGlow: '0px 0px 14px rgba(226,168,75,0.4)',
    theirsFill: 'rgba(36,34,32,0.9)',
    theirsEdge: 'rgba(240,196,106,0.3)',
    stars: { max: 0, deep: false },
    texture: 'gold',
    scene: 'embers',
  }),
  vibe({
    id: 'afrofuturism',
    label: 'Afro-Futurism',
    detail: 'Deep purple and gold, geometric lines',
    mesh: ['#5C1F9E', '#2A0E4E', '#7A5410'],
    lights: [
      light('a', '#9B4BF0', 1.6, [0.1, 0.45], [0.1, 0.28], [0.6, 0.85], 14000),
      light('b', '#F2B33A', 1.5, [0.9, 0.55], [0.8, 0.6], [0.45, 0.65], 18000),
      light('c', '#C03A8A', 1.0, [0.9, 0.7], [0.35, 0.5], [0.25, 0.38], 22000),
    ],
    accent: '#F2C14E',
    mine: ['rgba(250,214,120,0.97)', 'rgba(242,182,64,0.96)', 'rgba(204,140,30,0.95)'],
    mineText: '#1E0A30',
    mineEdge: 'rgba(170,110,240,0.9)',
    theirsFill: 'rgba(44,14,80,0.88)',
    theirsEdge: 'rgba(242,193,78,0.45)',
    theirsText: '#F7EEFF',
    texture: 'geo',
  }),
  vibe({
    id: 'y2k',
    label: 'Y2K Luxe',
    detail: 'Bright bubblegum pink and chrome',
    // A light vibe: bright pink to silver, nothing like the dark ones.
    mesh: ['#FFC2E4', '#FF8FCB', '#E6EAF3'],
    lights: [
      light('a', '#FFFFFF', 1.5, [0.12, 0.45], [0.1, 0.26], [0.45, 0.7], 13000),
      light('b', '#FF5FB3', 1.4, [0.88, 0.6], [0.78, 0.6], [0.35, 0.55], 18000),
      light('c', '#DCE3F2', 1.1, [0.9, 0.7], [0.35, 0.5], [0.4, 0.6], 21000),
    ],
    veil: 'rgba(255,255,255,0)',
    light: true,
    ink: '#3A0A26',
    accent: '#C2187F',
    accentSoft: 'rgba(194,24,127,0.12)',
    accentEdge: 'rgba(194,24,127,0.6)',
    // Yours: hot pink candy with white text. Theirs: polished chrome.
    mine: ['rgba(238,70,160,0.98)', 'rgba(194,24,127,0.98)', 'rgba(160,14,104,0.98)'],
    mineText: '#FFFFFF',
    mineMeta: 'rgba(255,255,255,0.75)',
    mineEdge: 'rgba(255,255,255,0.95)',
    mineGlow: '0px 0px 14px rgba(255,95,179,0.6)',
    theirs: ['rgba(255,255,255,0.95)', 'rgba(205,212,228,0.9)'],
    theirsFill: 'rgba(236,239,246,0.96)',
    theirsEdge: 'rgba(255,255,255,1)',
    theirsText: '#3A0A26',
    bar: 'rgba(255,214,236,0.85)',
    stars: { max: 0, deep: false },
    texture: 'chrome',
  }),
  vibe({
    id: 'cinema',
    label: 'Cinema Classic',
    detail: 'Black and white, film grain',
    mesh: ['#3C3C3C', '#141414', '#2E2E2E'],
    lights: [
      light('a', '#FFFFFF', 1.4, [0.2, 0.5], [0.1, 0.22], [0.22, 0.32], 16000),
      light('b', '#8A8A8A', 1.7, [0.85, 0.55], [0.8, 0.62], [0.25, 0.4], 21000),
      light('c', '#D0D0D0', 1.0, [0.9, 0.7], [0.35, 0.45], [0.16, 0.22], 25000),
    ],
    accent: '#EDEDED',
    mine: ['rgba(246,246,246,0.97)', 'rgba(218,218,218,0.95)', 'rgba(178,178,178,0.94)'],
    mineText: '#111111',
    theirsFill: 'rgba(36,36,36,0.9)',
    theirsEdge: 'rgba(255,255,255,0.3)',
    theirsText: '#F2F2F2',
    stars: { max: 0, deep: false },
    texture: 'film',
  }),
  vibe({
    id: 'golden-hour',
    label: 'Golden Hour',
    detail: 'Warm amber light, low sun',
    mesh: ['#F0962E', '#6E2F0A', '#D45A16'],
    lights: [
      light('a', '#FFC56B', 1.8, [0.75, 0.55], [0.05, 0.18], [0.7, 0.95], 14000),
      light('b', '#FF9A3C', 1.6, [0.1, 0.4], [0.75, 0.55], [0.5, 0.7], 18000),
      light('c', '#E0603A', 1.1, [0.15, 0.3], [0.35, 0.5], [0.3, 0.45], 22000),
    ],
    veil: 'rgba(40,14,2,0.12)',
    accent: '#FFC56B',
    mine: ['rgba(255,230,180,0.98)', 'rgba(255,196,120,0.97)', 'rgba(244,150,70,0.96)'],
    mineText: '#2A1204',
    theirsFill: 'rgba(66,26,6,0.88)',
    theirsEdge: 'rgba(255,197,107,0.45)',
    theirsText: '#FFF3E4',
    stars: { max: 0, deep: false },
    texture: 'rays',
    scene: 'embers',
  }),
  vibe({
    id: 'cyberpunk',
    label: 'Cyberpunk',
    detail: 'Gritty red and cyan neon',
    mesh: ['#7A0A26', '#120A14', '#047080'],
    lights: [
      light('a', '#FF2A4D', 1.6, [0.1, 0.4], [0.12, 0.3], [0.6, 0.85], 12000),
      light('b', '#00E5FF', 1.6, [0.9, 0.6], [0.78, 0.58], [0.55, 0.8], 16000),
      light('c', '#B000FF', 0.9, [0.85, 0.65], [0.35, 0.48], [0.2, 0.32], 20000),
    ],
    accent: '#00E5FF',
    mine: ['rgba(80,240,255,0.97)', 'rgba(0,200,236,0.96)', 'rgba(0,150,196,0.95)'],
    mineText: '#00121A',
    mineGlow: '0px 0px 18px rgba(0,229,255,0.6)',
    theirsFill: 'rgba(40,6,16,0.9)',
    theirsEdge: 'rgba(255,42,77,0.75)',
    theirsText: '#FFE8EC',
    stars: { max: 0, deep: false },
    texture: 'scan',
    scene: 'rain',
  }),
  vibe({
    id: 'minimalist',
    label: 'Minimalist',
    detail: 'Bright white, stark black text',
    // A near-white paper backdrop: the one light vibe.
    mesh: ['#FFFFFF', '#F4F4F6', '#ECECEF'],
    // Faint grey lights, barely there, so the paper isn't dead flat.
    lights: [
      light('a', '#E2E2E6', 1.1, [0.2, 0.45], [0.2, 0.4], [0.3, 0.45], 28000),
      light('b', '#D8D8DE', 1.2, [0.8, 0.55], [0.7, 0.55], [0.25, 0.4], 32000),
      light('c', '#E6E6EA', 1, [0.5, 0.5], [0.4, 0.6], [0.2, 0.3], 30000),
    ],
    veil: 'rgba(255,255,255,0)',
    light: true,
    ink: '#111113',
    accent: '#111113',
    accentSoft: 'rgba(17,17,19,0.06)',
    accentEdge: 'rgba(17,17,19,0.22)',
    // Your bubbles: solid near-black with white text, the only strong block.
    mine: ['rgba(28,28,30,1)', 'rgba(20,20,22,1)', 'rgba(14,14,16,1)'],
    mineText: '#FFFFFF',
    mineMeta: 'rgba(255,255,255,0.68)',
    mineEdge: 'rgba(0,0,0,0.9)',
    // Theirs: a light grey card, stark black text.
    theirs: ['rgba(0,0,0,0)', 'rgba(0,0,0,0)'],
    theirsFill: 'rgba(237,237,240,1)',
    theirsEdge: 'rgba(0,0,0,0.12)',
    theirsText: '#111113',
    bar: 'rgba(248,248,250,0.96)',
    send: ['#111113', '#141416', '#1C1C1E'],
    sendIcon: '#FFFFFF',
    stars: { max: 0, deep: false },
    grain: false,
    radius: 6,
    texture: null,
  }),
  vibe({
    id: 'the-block',
    label: 'The Block',
    detail: 'Concrete, grit and a sodium streetlight',
    mesh: ['#5E5E61', '#3A3A3C', '#4C4C4F'],
    lights: [
      light('a', '#F2A33A', 1.5, [0.8, 0.6], [0.06, 0.2], [0.35, 0.5], 16000),
      light('b', '#6A7A8A', 1.6, [0.1, 0.4], [0.75, 0.6], [0.25, 0.4], 21000),
      light('c', '#9A9A9A', 1.0, [0.2, 0.4], [0.35, 0.5], [0.16, 0.24], 25000),
    ],
    veil: 'rgba(20,20,22,0.12)',
    accent: '#F2A33A',
    mine: ['rgba(246,176,80,0.97)', 'rgba(224,138,46,0.96)', 'rgba(186,106,34,0.95)'],
    mineText: '#1A0E02',
    theirsFill: 'rgba(30,30,32,0.9)',
    theirsEdge: 'rgba(255,255,255,0.22)',
    stars: { max: 0, deep: false },
    texture: 'concrete',
    scene: 'rain',
  }),
];
/** The thirteenth choice: any colour, laid over Noir as a translucent wash. */
export const CUSTOM_ID = 'custom';
export const DEFAULT_CUSTOM_COLOR = '#2F7BFF';

export const DEFAULT_VIBE = 'noir';
/**
 * Where someone who has never picked a vibe starts: a Premium one, so a new
 * member's free trial opens on the full experience. If Premium isn't on,
 * allowedVibe shows Noir in its place.
 */
export const WELCOME_VIBE = 'turntable';

/**
 * The vibes anyone can use; every other one, and Custom, is BOA Premium.
 * Premium vibes show with a lock in the picker, and a saved one falls back
 * to Noir (on this phone's screen only, the choice is kept) if Premium ends.
 */
export const FREE_VIBES = ['noir', 'neon', 'minimalist', 'the-block'];
export const isPremiumVibe = (id) => !FREE_VIBES.includes(id);
/** The vibe to draw: yours, or Noir if it's a Premium one and Premium is locked. */
export const allowedVibe = (vibe, unlocked) => (unlocked || !isPremiumVibe(vibe.id) ? vibe : VIBES[0]);
export const vibeById = (id, customColor = DEFAULT_CUSTOM_COLOR) => (id === CUSTOM_ID ? customVibe(customColor) : (VIBES.find((v) => v.id === id) ?? VIBES[0]));

/**
 * Custom: Noir with your colour washed over it at 15% (so text always
 * reads), the lights and buttons in your colour, and your bubbles in it.
 */
export function customVibe(hex) {
  const color = /^#[0-9a-f]{6}$/i.test(hex) ? hex.toUpperCase() : DEFAULT_CUSTOM_COLOR;
  const noir = VIBES[0];
  const n = parseInt(color.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  // A very dark pick still needs a visible accent: lift it towards white.
  const lift = (v, k) => Math.round(v + (255 - v) * k);
  const k = lum < 0.35 ? 0.45 : 0;
  const accent = `#${[lift(r, k), lift(g, k), lift(b, k)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
  // Black or white, whichever reads better on the bubble as it's drawn over the chat.
  const mineText = textOn(color, 0.06, noir.mesh[1]);
  return {
    ...noir,
    id: CUSTOM_ID,
    label: 'Custom',
    detail: 'Any colour you like',
    customColor: color,
    lights: noir.lights.map((l, i) => ({ ...l, color: i === 2 ? noir.lights[2].color : accent })),
    veil: alpha(color, 0.15),
    accent,
    accentSoft: alpha(accent, 0.16),
    accentEdge: alpha(accent, 0.85),
    mine: [alpha(accent, 0.96), alpha(color, 0.94), `rgba(${Math.round(r * 0.8)},${Math.round(g * 0.8)},${Math.round(b * 0.8)},0.93)`],
    mineText,
    mineMeta: mineText === '#FFFFFF' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.58)',
    mineEdge: alpha(accent, 0.9),
    send: [accent, color, color],
    sendIcon: mineText,
    texture: null,
    radius: null,
  };
}

// One choice for the whole app, so a pick in the thread or in Settings
// shows everywhere at once. Read from the device on first use.
let current = { id: WELCOME_VIBE, custom: DEFAULT_CUSTOM_COLOR, motion: MOTION };
let loaded = null;
const listeners = new Set();
const publish = (next) => {
  current = next;
  listeners.forEach((fn) => fn(next));
};
const known = (id) => id === CUSTOM_ID || VIBES.some((v) => v.id === id);

function load() {
  loaded ??= Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(CUSTOM_KEY), AsyncStorage.getItem(MOTION_KEY)])
    .then(([id, custom, motion]) => {
      const next = {
        id: id && known(id) ? id : current.id,
        custom: custom && /^#[0-9a-f]{6}$/i.test(custom) ? custom : current.custom,
        motion: MODES.includes(motion) ? motion : current.motion,
      };
      if (next.id !== current.id || next.custom !== current.custom || next.motion !== current.motion) publish(next);
    })
    .catch(() => {});
  return loaded;
}

export function setChatVibe(id) {
  const next = known(id) ? id : DEFAULT_VIBE;
  publish({ ...current, id: next });
  return AsyncStorage.setItem(KEY, next).catch(() => {});
}

/** Custom: picks your colour and switches to it. */
export function setCustomColor(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return Promise.resolve();
  const color = hex.toUpperCase();
  publish({ ...current, id: CUSTOM_ID, custom: color });
  return Promise.all([AsyncStorage.setItem(KEY, CUSTOM_ID), AsyncStorage.setItem(CUSTOM_KEY, color)]).catch(() => {});
}

/** Motion or Static, for every chat on this phone. */
export function setChatMotion(mode) {
  const next = MODES.includes(mode) ? mode : MOTION;
  publish({ ...current, motion: next });
  return AsyncStorage.setItem(MOTION_KEY, next).catch(() => {});
}

/** The chosen vibe (its full look), your custom colour, Motion or Static, and setters that save them. */
export default function useChatVibe() {
  const [state, setState] = useState(current);
  useEffect(() => {
    listeners.add(setState);
    setState(current);
    load();
    return () => listeners.delete(setState);
  }, []);
  return { vibe: vibeById(state.id, state.custom), customColor: state.custom, motion: state.motion, setVibe: setChatVibe, setCustomColor, setMotion: setChatMotion };
}

/** For tests: forget the in-memory choice so the next read comes from storage. */
export function resetChatVibe() {
  current = { id: WELCOME_VIBE, custom: DEFAULT_CUSTOM_COLOR, motion: MOTION };
  loaded = null;
}
