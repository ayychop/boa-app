import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'boa:chat-vibe:v1';

/**
 * The chat thread's looks, in the order the picker offers them. Each sets
 * the backdrop (a diagonal mesh of three tones, the drifting lights over it
 * and how bright the stars are), the glass of both kinds of bubble, the
 * header and composer glass, and the accent the buttons and dots glow in.
 */
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
  },
];

export const DEFAULT_VIBE = 'noir';
export const vibeById = (id) => VIBES.find((v) => v.id === id) ?? VIBES[0];

// One choice for the whole app, so a pick in the thread or in Settings
// shows everywhere at once. Read from the device on first use.
let current = DEFAULT_VIBE;
let loaded = null;
const listeners = new Set();

function load() {
  loaded ??= AsyncStorage.getItem(KEY)
    .then((id) => {
      if (id && VIBES.some((v) => v.id === id) && id !== current) {
        current = id;
        listeners.forEach((fn) => fn(current));
      }
    })
    .catch(() => {});
  return loaded;
}

export function setChatVibe(id) {
  const next = vibeById(id).id;
  current = next;
  listeners.forEach((fn) => fn(next));
  return AsyncStorage.setItem(KEY, next).catch(() => {});
}

/** The chosen vibe (its full look) and a setter that saves it. */
export default function useChatVibe() {
  const [id, setId] = useState(current);
  useEffect(() => {
    listeners.add(setId);
    setId(current);
    load();
    return () => listeners.delete(setId);
  }, []);
  return { vibe: vibeById(id), setVibe: setChatVibe };
}

/** For tests: forget the in-memory choice so the next read comes from storage. */
export function resetChatVibe() {
  current = DEFAULT_VIBE;
  loaded = null;
}
