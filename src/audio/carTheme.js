import AsyncStorage from '@react-native-async-storage/async-storage';
import * as auto from '../../modules/boa-auto';

// The car theme (Profile > Car Settings): the stage Android Auto's tiles and
// now playing art are drawn on (modules/boa-auto BoaAutoArt, CarThemes),
// which the car also blurs into its whole background. Kept on this phone.
// The preview colours here mirror the native palettes.

const KEY = 'boa.car.theme';

export const CAR_THEMES = [
  { id: 'noir', label: 'Noir Gold', detail: 'BOA black, lit gold from above', colors: ['#1A1A1D', '#050506'], glow: '#E2A84B', accent: '#E2A84B', glowAt: { x: 0.5, y: 0.08 } },
  { id: 'aurora', label: 'Aurora', detail: 'Teal and violet ribbons over deep night', colors: ['#0B1A24', '#03060B'], glow: '#2EE6C5', accent: '#7FF3DD', band: '#6B3FD8', glowAt: { x: 0.3, y: 0.1 } },
  { id: 'chrome', label: 'Midnight Chrome', detail: 'Brushed silver under a cool blue light', colors: ['#1C222C', '#05070B'], glow: '#C9D6E8', accent: '#DDE6F2', glowAt: { x: 0.7, y: 0.05 } },
  { id: 'sunset', label: 'Sunset Drive', detail: 'A low sun on a neon horizon', colors: ['#2A0F2E', '#0A0510'], glow: '#FF8A3D', accent: '#FFB36B', band: '#D6246E', glowAt: { x: 0.5, y: 0.82 } },
  { id: 'carbon', label: 'Carbon Red', detail: 'Woven carbon fibre, lit race red', colors: ['#151515', '#050505'], glow: '#E0182D', accent: '#FF4A5C', glowAt: { x: 0.5, y: 0 } },
];
export const DEFAULT_CAR_THEME = CAR_THEMES[0].id;
export const carThemeById = (id) => CAR_THEMES.find((t) => t.id === id) ?? CAR_THEMES[0];

let current = null;

/** Resolves to the saved theme's id (Noir Gold until one is chosen). */
export async function loadCarTheme() {
  if (current) return current;
  try {
    current = carThemeById(await AsyncStorage.getItem(KEY)).id;
  } catch {
    current = DEFAULT_CAR_THEME;
  }
  return current;
}

/** Chooses a theme: saved, and the car redraws at once if it's connected. */
export async function setCarTheme(id) {
  current = carThemeById(id).id;
  auto.setTheme(current);
  await AsyncStorage.setItem(KEY, current).catch(() => {});
  return current;
}
