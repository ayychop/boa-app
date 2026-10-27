import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { textOn } from './bubbleTheme';

const KEY = 'boa:chat-vibe:v1';
const CUSTOM_KEY = 'boa:chat-vibe-custom:v1';

/**
 * The chat thread's looks, in the order the picker offers them. Each sets
 * the backdrop (a diagonal mesh of three tones, the drifting lights over it
 * and how bright the stars are), the glass of both kinds of bubble, the
 * header and composer glass, and the accent the buttons and dots glow in.
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
    bar: alpha(v.mesh[1], 0.55),
    send: [v.mine[0], v.mine[1], v.mine[2]],
    sendIcon: v.mineText,
    radius: null,
    ...v,
  };
}

export const VIBES = [
  {
    id: 'noir',
    label: 'Noir',
    detail: 'Deep black, gold glass',
    mesh: ['#121014', '#07070A', '#120D07'],
    lights: [
      { id: 'a', color: '#E2A84B', size: 1.5, x: [0.12, 0.5], y: [0.1, 0.24], opacity: [0.5, 0.75], ms: 14000 },
      { id: 'b', color: '#C2601F', size: 1.7, x: [0.85, 0.5], y: [0.78, 0.6], opacity: [0.4, 0.6], ms: 19000 },
      { id: 'c', color: '#3B5B8C', size: 1.2, x: [0.95, 0.7], y: [0.36, 0.5], opacity: [0.2, 0.34], ms: 23000 },
    ],
    veil: 'rgba(5,5,6,0.2)',
    stars: { max: 0.55, deep: false },
    accent: '#E2A84B',
    accentSoft: 'rgba(226,168,75,0.16)',
    accentEdge: 'rgba(246,206,132,0.85)',
    mine: ['rgba(252,230,182,0.97)', 'rgba(232,180,96,0.94)', 'rgba(196,130,44,0.92)'],
    mineText: '#0B0906',
    mineMeta: 'rgba(11,9,6,0.58)',
    mineEdge: 'rgba(255,240,206,0.9)',
    mineGlow: null,
    theirs: ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.06)'],
    theirsFill: 'rgba(28,26,30,0.82)',
    theirsEdge: 'rgba(255,255,255,0.2)',
    bar: 'rgba(12,11,14,0.5)',
    send: ['#FBE3B0', '#E2A84B', '#C7862E'],
    sendIcon: '#0B0906',
    texture: null,
  },
  {
    id: 'neon',
    label: 'Neon',
    detail: 'Blue and violet mesh, glowing edges',
    mesh: ['#1A0F3D', '#0A0D2B', '#04122E'],
    lights: [
      { id: 'a', color: '#7B4DFF', size: 1.6, x: [0.1, 0.45], y: [0.12, 0.3], opacity: [0.6, 0.85], ms: 13000 },
      { id: 'b', color: '#2F6BFF', size: 1.8, x: [0.9, 0.55], y: [0.8, 0.58], opacity: [0.55, 0.8], ms: 17000 },
      { id: 'c', color: '#00D4FF', size: 1.1, x: [0.95, 0.65], y: [0.4, 0.52], opacity: [0.25, 0.45], ms: 21000 },
    ],
    veil: 'rgba(6,6,24,0.18)',
    stars: { max: 0.45, deep: false },
    accent: '#8C9BFF',
    accentSoft: 'rgba(124,108,255,0.2)',
    accentEdge: 'rgba(160,170,255,0.9)',
    mine: ['rgba(150,110,255,0.95)', 'rgba(96,108,255,0.92)', 'rgba(40,170,255,0.9)'],
    mineText: '#FFFFFF',
    mineMeta: 'rgba(255,255,255,0.7)',
    mineEdge: 'rgba(200,190,255,0.9)',
    mineGlow: '0px 0px 16px rgba(120,100,255,0.55)',
    theirs: ['rgba(140,155,255,0.2)', 'rgba(140,155,255,0.06)'],
    theirsFill: 'rgba(16,18,52,0.8)',
    theirsEdge: 'rgba(150,165,255,0.4)',
    bar: 'rgba(10,10,36,0.5)',
    send: ['#C3A8FF', '#7B6CFF', '#2FA8FF'],
    sendIcon: '#FFFFFF',
    texture: null,
  },
  {
    id: 'midnight',
    label: 'Midnight',
    detail: 'Deep charcoal under a starry sky',
    mesh: ['#22252D', '#16181D', '#0F1014'],
    lights: [
      { id: 'a', color: '#5A6684', size: 1.5, x: [0.15, 0.45], y: [0.08, 0.22], opacity: [0.35, 0.55], ms: 16000 },
      { id: 'b', color: '#2F3650', size: 1.8, x: [0.85, 0.55], y: [0.8, 0.62], opacity: [0.45, 0.65], ms: 21000 },
      { id: 'c', color: '#E2A84B', size: 0.9, x: [0.9, 0.7], y: [0.3, 0.42], opacity: [0.16, 0.26], ms: 25000 },
    ],
    veil: 'rgba(10,11,14,0.12)',
    stars: { max: 0.95, deep: true },
    accent: '#D6DEF2',
    accentSoft: 'rgba(214,222,242,0.12)',
    accentEdge: 'rgba(228,234,248,0.8)',
    mine: ['rgba(240,243,250,0.96)', 'rgba(204,212,230,0.94)', 'rgba(160,170,196,0.92)'],
    mineText: '#101218',
    mineMeta: 'rgba(16,18,24,0.55)',
    mineEdge: 'rgba(255,255,255,0.9)',
    mineGlow: null,
    theirs: ['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.05)'],
    theirsFill: 'rgba(40,43,52,0.82)',
    theirsEdge: 'rgba(255,255,255,0.18)',
    bar: 'rgba(22,24,30,0.5)',
    send: ['#FFFFFF', '#D6DEF2', '#9AA6C4'],
    sendIcon: '#101218',
    texture: null,
  },
  vibe({
    id: 'turntable',
    label: 'Turntable',
    detail: 'A record turning slowly behind the chat',
    mesh: ['#1C1814', '#100E0C', '#16120E'],
    lights: [
      light('a', '#C98A3A', 1.5, [0.15, 0.45], [0.12, 0.26], [0.4, 0.6], 15000),
      light('b', '#7A2E1E', 1.6, [0.85, 0.55], [0.75, 0.6], [0.3, 0.45], 20000),
      light('c', '#3A4A5C', 1.1, [0.9, 0.7], [0.3, 0.45], [0.18, 0.28], 24000),
    ],
    accent: '#E8B866',
    mine: ['rgba(242,210,150,0.97)', 'rgba(218,166,88,0.95)', 'rgba(178,118,50,0.94)'],
    mineText: '#120D06',
    texture: 'vinyl',
  }),
  vibe({
    id: 'street-luxury',
    label: 'Street Luxury',
    detail: 'Dark glass with a gold monogram weave',
    mesh: ['#16120A', '#0D0B08', '#18130A'],
    lights: [
      light('a', '#E2A84B', 1.4, [0.1, 0.4], [0.1, 0.25], [0.35, 0.55], 15000),
      light('b', '#8C5A1E', 1.7, [0.9, 0.6], [0.8, 0.6], [0.35, 0.5], 19000),
      light('c', '#F3D9A4', 0.9, [0.85, 0.65], [0.3, 0.4], [0.16, 0.24], 23000),
    ],
    accent: '#F0C46A',
    mine: ['rgba(46,37,20,0.96)', 'rgba(32,26,14,0.95)', 'rgba(24,19,10,0.95)'],
    mineText: '#F6D38A',
    mineEdge: 'rgba(226,168,75,0.85)',
    mineGlow: '0px 0px 14px rgba(226,168,75,0.35)',
    texture: 'gold',
  }),
  vibe({
    id: 'afrofuturism',
    label: 'Afro-Futurism',
    detail: 'Deep purple and gold, geometric lines',
    mesh: ['#2C1040', '#160B28', '#2E1B08'],
    lights: [
      light('a', '#8B3FD9', 1.6, [0.1, 0.45], [0.1, 0.28], [0.5, 0.75], 14000),
      light('b', '#E2A84B', 1.5, [0.9, 0.55], [0.8, 0.6], [0.35, 0.55], 18000),
      light('c', '#C03A8A', 1.0, [0.9, 0.7], [0.35, 0.5], [0.2, 0.32], 22000),
    ],
    accent: '#F2C14E',
    mine: ['rgba(160,96,236,0.96)', 'rgba(118,58,196,0.95)', 'rgba(80,34,148,0.94)'],
    mineText: '#FFFFFF',
    mineEdge: 'rgba(242,193,78,0.85)',
    texture: 'geo',
  }),
  vibe({
    id: 'y2k',
    label: 'Y2K Luxe',
    detail: 'Hot pink and chrome',
    mesh: ['#2E1028', '#180A1A', '#201C2A'],
    lights: [
      light('a', '#FF5FB3', 1.6, [0.12, 0.45], [0.1, 0.26], [0.5, 0.75], 13000),
      light('b', '#C9D2E3', 1.4, [0.88, 0.6], [0.78, 0.6], [0.25, 0.4], 18000),
      light('c', '#B58CFF', 1.1, [0.9, 0.7], [0.35, 0.5], [0.25, 0.4], 21000),
    ],
    accent: '#FF8AC8',
    mine: ['rgba(255,196,228,0.97)', 'rgba(255,128,194,0.95)', 'rgba(214,84,164,0.94)'],
    mineText: '#2A0618',
    mineEdge: 'rgba(235,240,250,0.95)',
    mineGlow: '0px 0px 14px rgba(255,95,179,0.45)',
    texture: 'chrome',
  }),
  vibe({
    id: 'cinema',
    label: 'Cinema Classic',
    detail: 'Black and white, film grain',
    mesh: ['#1E1E1E', '#121212', '#1A1A1A'],
    lights: [
      light('a', '#FFFFFF', 1.4, [0.2, 0.5], [0.1, 0.22], [0.18, 0.28], 16000),
      light('b', '#8A8A8A', 1.7, [0.85, 0.55], [0.8, 0.62], [0.25, 0.4], 21000),
      light('c', '#D0D0D0', 1.0, [0.9, 0.7], [0.35, 0.45], [0.16, 0.22], 25000),
    ],
    accent: '#EDEDED',
    mine: ['rgba(246,246,246,0.97)', 'rgba(218,218,218,0.95)', 'rgba(178,178,178,0.94)'],
    mineText: '#111111',
    theirsFill: 'rgba(40,40,40,0.86)',
    stars: { max: 0, deep: false },
    texture: 'film',
  }),
  vibe({
    id: 'golden-hour',
    label: 'Golden Hour',
    detail: 'Warm amber light, low sun',
    mesh: ['#3C200C', '#201208', '#2C1607'],
    lights: [
      light('a', '#FFC56B', 1.7, [0.75, 0.55], [0.05, 0.18], [0.55, 0.8], 14000),
      light('b', '#FF9A3C', 1.6, [0.1, 0.4], [0.75, 0.55], [0.4, 0.6], 18000),
      light('c', '#E0603A', 1.1, [0.15, 0.3], [0.35, 0.5], [0.25, 0.4], 22000),
    ],
    accent: '#FFC56B',
    mine: ['rgba(255,218,156,0.97)', 'rgba(255,176,96,0.95)', 'rgba(232,126,62,0.94)'],
    mineText: '#2A1204',
    stars: { max: 0.2, deep: false },
    texture: 'rays',
  }),
  vibe({
    id: 'cyberpunk',
    label: 'Cyberpunk',
    detail: 'Gritty red and cyan neon',
    mesh: ['#2C0712', '#0E0B14', '#05242C'],
    lights: [
      light('a', '#FF2A4D', 1.5, [0.1, 0.4], [0.12, 0.3], [0.5, 0.75], 12000),
      light('b', '#00E5FF', 1.6, [0.9, 0.6], [0.78, 0.58], [0.45, 0.7], 16000),
      light('c', '#B000FF', 0.9, [0.85, 0.65], [0.35, 0.48], [0.2, 0.32], 20000),
    ],
    accent: '#00E5FF',
    mine: ['rgba(80,240,255,0.95)', 'rgba(0,200,236,0.94)', 'rgba(0,150,196,0.94)'],
    mineText: '#00121A',
    mineGlow: '0px 0px 16px rgba(0,229,255,0.5)',
    theirsEdge: 'rgba(255,42,77,0.6)',
    stars: { max: 0.15, deep: false },
    texture: 'scan',
  }),
  vibe({
    id: 'minimalist',
    label: 'Minimalist',
    detail: 'Ultra dark, sharp edges, nothing extra',
    mesh: ['#101012', '#0A0A0C', '#101012'],
    lights: [
      light('a', '#3A3A40', 1.4, [0.2, 0.5], [0.1, 0.25], [0.18, 0.24], 20000),
      light('b', '#2A2A30', 1.6, [0.8, 0.5], [0.8, 0.6], [0.18, 0.24], 24000),
      light('c', '#45454C', 1.0, [0.9, 0.7], [0.35, 0.45], [0.16, 0.2], 28000),
    ],
    accent: '#F3EFE8',
    mine: ['rgba(243,239,232,0.98)', 'rgba(243,239,232,0.98)', 'rgba(232,228,220,0.98)'],
    mineText: '#0A0A0C',
    mineEdge: 'rgba(255,255,255,1)',
    theirsFill: 'rgba(20,20,23,0.96)',
    theirsEdge: 'rgba(243,239,232,0.35)',
    stars: { max: 0, deep: false },
    radius: 6,
    texture: null,
  }),
  vibe({
    id: 'the-block',
    label: 'The Block',
    detail: 'Concrete, grit and a sodium streetlight',
    mesh: ['#2C2C2E', '#1E1E20', '#252527'],
    lights: [
      light('a', '#F2A33A', 1.5, [0.8, 0.6], [0.06, 0.2], [0.4, 0.6], 16000),
      light('b', '#6A7A8A', 1.6, [0.1, 0.4], [0.75, 0.6], [0.25, 0.4], 21000),
      light('c', '#9A9A9A', 1.0, [0.2, 0.4], [0.35, 0.5], [0.16, 0.24], 25000),
    ],
    accent: '#F2A33A',
    mine: ['rgba(246,176,80,0.96)', 'rgba(224,138,46,0.95)', 'rgba(186,106,34,0.94)'],
    mineText: '#1A0E02',
    theirsFill: 'rgba(48,48,51,0.86)',
    stars: { max: 0, deep: false },
    texture: 'concrete',
  }),
];

/** The thirteenth choice: any colour, laid over Noir as a translucent wash. */
export const CUSTOM_ID = 'custom';
export const DEFAULT_CUSTOM_COLOR = '#2F7BFF';

export const DEFAULT_VIBE = 'noir';
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
let current = { id: DEFAULT_VIBE, custom: DEFAULT_CUSTOM_COLOR };
let loaded = null;
const listeners = new Set();
const publish = (next) => {
  current = next;
  listeners.forEach((fn) => fn(next));
};
const known = (id) => id === CUSTOM_ID || VIBES.some((v) => v.id === id);

function load() {
  loaded ??= Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(CUSTOM_KEY)])
    .then(([id, custom]) => {
      const next = {
        id: id && known(id) ? id : current.id,
        custom: custom && /^#[0-9a-f]{6}$/i.test(custom) ? custom : current.custom,
      };
      if (next.id !== current.id || next.custom !== current.custom) publish(next);
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
  publish({ id: CUSTOM_ID, custom: color });
  return Promise.all([AsyncStorage.setItem(KEY, CUSTOM_ID), AsyncStorage.setItem(CUSTOM_KEY, color)]).catch(() => {});
}

/** The chosen vibe (its full look), your custom colour, and setters that save them. */
export default function useChatVibe() {
  const [state, setState] = useState(current);
  useEffect(() => {
    listeners.add(setState);
    setState(current);
    load();
    return () => listeners.delete(setState);
  }, []);
  return { vibe: vibeById(state.id, state.custom), customColor: state.custom, setVibe: setChatVibe, setCustomColor };
}

/** For tests: forget the in-memory choice so the next read comes from storage. */
export function resetChatVibe() {
  current = { id: DEFAULT_VIBE, custom: DEFAULT_CUSTOM_COLOR };
  loaded = null;
}
