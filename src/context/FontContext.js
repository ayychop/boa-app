import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Font from 'expo-font';
import { fonts } from '../theme';

// The typeface a member picks in Hub Settings. It dresses three places and
// only three: the chat thread (messages, composer, pickers), the Hub profile
// page and the profile settings page (see FontScope in components/ScopedText).
// Everything else (the radio, BOA Originals, Zen, the tabs) keeps the BOA
// house face, and the mono slate labels, the serif flourish, the timestamps
// and the wordmark are never governed by it, so it always still looks like BOA.
//
// Each option names its four weights. The faces load on demand (they're
// bundled with the app, just not registered at launch), so adding to this list
// costs nothing until a member opens the picker or chooses one.
const KEY = 'boa.appFont.v1';

// What each of the app's house families weighs, so any of them can be swapped
// for the same weight in the chosen face.
export const ROLE_OF = {
  [fonts.extralight]: 'regular',
  [fonts.light]: 'regular',
  [fonts.regular]: 'regular',
  [fonts.medium]: 'medium',
  [fonts.semibold]: 'semibold',
  [fonts.bold]: 'bold',
  [fonts.extrabold]: 'bold',
  [fonts.chat]: 'medium',
  [fonts.chatBold]: 'bold',
};

export const APP_FONTS = [
  {
    id: 'signature',
    label: 'Signature',
    detail: 'The BOA house face',
    // The house face: nothing is swapped.
    weights: { regular: fonts.regular, medium: fonts.medium, semibold: fonts.semibold, bold: fonts.bold },
    files: null,
  },
  {
    id: 'rounded',
    label: 'Rounded',
    detail: 'Soft and friendly',
    weights: { regular: 'PlusJakartaSans_400Regular', medium: 'PlusJakartaSans_500Medium', semibold: 'PlusJakartaSans_600SemiBold', bold: 'PlusJakartaSans_700Bold' },
    files: {
      PlusJakartaSans_400Regular: () => require('@expo-google-fonts/plus-jakarta-sans/400Regular/PlusJakartaSans_400Regular.ttf'),
      PlusJakartaSans_500Medium: () => require('@expo-google-fonts/plus-jakarta-sans/500Medium/PlusJakartaSans_500Medium.ttf'),
      PlusJakartaSans_600SemiBold: () => require('@expo-google-fonts/plus-jakarta-sans/600SemiBold/PlusJakartaSans_600SemiBold.ttf'),
      PlusJakartaSans_700Bold: () => require('@expo-google-fonts/plus-jakarta-sans/700Bold/PlusJakartaSans_700Bold.ttf'),
    },
  },
  {
    id: 'technical',
    label: 'Technical',
    detail: 'Precise and modern',
    weights: { regular: 'SpaceGrotesk_400Regular', medium: 'SpaceGrotesk_500Medium', semibold: 'SpaceGrotesk_600SemiBold', bold: 'SpaceGrotesk_700Bold' },
    files: {
      SpaceGrotesk_400Regular: () => require('@expo-google-fonts/space-grotesk/400Regular/SpaceGrotesk_400Regular.ttf'),
      SpaceGrotesk_500Medium: () => require('@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf'),
      SpaceGrotesk_600SemiBold: () => require('@expo-google-fonts/space-grotesk/600SemiBold/SpaceGrotesk_600SemiBold.ttf'),
      SpaceGrotesk_700Bold: () => require('@expo-google-fonts/space-grotesk/700Bold/SpaceGrotesk_700Bold.ttf'),
    },
  },
  {
    id: 'poppins',
    label: 'Poppins',
    detail: 'Clean and geometric',
    weights: { regular: 'Poppins_400Regular', medium: 'Poppins_500Medium', semibold: 'Poppins_600SemiBold', bold: 'Poppins_700Bold' },
    files: {
      Poppins_400Regular: () => require('@expo-google-fonts/poppins/400Regular/Poppins_400Regular.ttf'),
      Poppins_500Medium: () => require('@expo-google-fonts/poppins/500Medium/Poppins_500Medium.ttf'),
      Poppins_600SemiBold: () => require('@expo-google-fonts/poppins/600SemiBold/Poppins_600SemiBold.ttf'),
      Poppins_700Bold: () => require('@expo-google-fonts/poppins/700Bold/Poppins_700Bold.ttf'),
    },
  },
  {
    id: 'dmsans',
    label: 'DM Sans',
    detail: 'Calm and low-contrast',
    weights: { regular: 'DMSans_400Regular', medium: 'DMSans_500Medium', semibold: 'DMSans_600SemiBold', bold: 'DMSans_700Bold' },
    files: {
      DMSans_400Regular: () => require('@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf'),
      DMSans_500Medium: () => require('@expo-google-fonts/dm-sans/500Medium/DMSans_500Medium.ttf'),
      DMSans_600SemiBold: () => require('@expo-google-fonts/dm-sans/600SemiBold/DMSans_600SemiBold.ttf'),
      DMSans_700Bold: () => require('@expo-google-fonts/dm-sans/700Bold/DMSans_700Bold.ttf'),
    },
  },
  {
    id: 'outfit',
    label: 'Outfit',
    detail: 'Round and modern',
    weights: { regular: 'Outfit_400Regular', medium: 'Outfit_500Medium', semibold: 'Outfit_600SemiBold', bold: 'Outfit_700Bold' },
    files: {
      Outfit_400Regular: () => require('@expo-google-fonts/outfit/400Regular/Outfit_400Regular.ttf'),
      Outfit_500Medium: () => require('@expo-google-fonts/outfit/500Medium/Outfit_500Medium.ttf'),
      Outfit_600SemiBold: () => require('@expo-google-fonts/outfit/600SemiBold/Outfit_600SemiBold.ttf'),
      Outfit_700Bold: () => require('@expo-google-fonts/outfit/700Bold/Outfit_700Bold.ttf'),
    },
  },
  {
    id: 'sora',
    label: 'Sora',
    detail: 'Wide and futuristic',
    weights: { regular: 'Sora_400Regular', medium: 'Sora_500Medium', semibold: 'Sora_600SemiBold', bold: 'Sora_700Bold' },
    files: {
      Sora_400Regular: () => require('@expo-google-fonts/sora/400Regular/Sora_400Regular.ttf'),
      Sora_500Medium: () => require('@expo-google-fonts/sora/500Medium/Sora_500Medium.ttf'),
      Sora_600SemiBold: () => require('@expo-google-fonts/sora/600SemiBold/Sora_600SemiBold.ttf'),
      Sora_700Bold: () => require('@expo-google-fonts/sora/700Bold/Sora_700Bold.ttf'),
    },
  },
  {
    id: 'playfair',
    label: 'Playfair',
    detail: 'Elegant high-contrast serif',
    weights: { regular: 'PlayfairDisplay_400Regular', medium: 'PlayfairDisplay_500Medium', semibold: 'PlayfairDisplay_600SemiBold', bold: 'PlayfairDisplay_700Bold' },
    files: {
      PlayfairDisplay_400Regular: () => require('@expo-google-fonts/playfair-display/400Regular/PlayfairDisplay_400Regular.ttf'),
      PlayfairDisplay_500Medium: () => require('@expo-google-fonts/playfair-display/500Medium/PlayfairDisplay_500Medium.ttf'),
      PlayfairDisplay_600SemiBold: () => require('@expo-google-fonts/playfair-display/600SemiBold/PlayfairDisplay_600SemiBold.ttf'),
      PlayfairDisplay_700Bold: () => require('@expo-google-fonts/playfair-display/700Bold/PlayfairDisplay_700Bold.ttf'),
    },
  },
  {
    id: 'lora',
    label: 'Lora',
    detail: 'Warm book serif',
    weights: { regular: 'Lora_400Regular', medium: 'Lora_500Medium', semibold: 'Lora_600SemiBold', bold: 'Lora_700Bold' },
    files: {
      Lora_400Regular: () => require('@expo-google-fonts/lora/400Regular/Lora_400Regular.ttf'),
      Lora_500Medium: () => require('@expo-google-fonts/lora/500Medium/Lora_500Medium.ttf'),
      Lora_600SemiBold: () => require('@expo-google-fonts/lora/600SemiBold/Lora_600SemiBold.ttf'),
      Lora_700Bold: () => require('@expo-google-fonts/lora/700Bold/Lora_700Bold.ttf'),
    },
  },
  {
    id: 'caveat',
    label: 'Handwritten',
    detail: 'Casual, like a note',
    weights: { regular: 'Caveat_400Regular', medium: 'Caveat_500Medium', semibold: 'Caveat_600SemiBold', bold: 'Caveat_700Bold' },
    files: {
      Caveat_400Regular: () => require('@expo-google-fonts/caveat/400Regular/Caveat_400Regular.ttf'),
      Caveat_500Medium: () => require('@expo-google-fonts/caveat/500Medium/Caveat_500Medium.ttf'),
      Caveat_600SemiBold: () => require('@expo-google-fonts/caveat/600SemiBold/Caveat_600SemiBold.ttf'),
      Caveat_700Bold: () => require('@expo-google-fonts/caveat/700Bold/Caveat_700Bold.ttf'),
    },
  },
  {
    id: 'spacemono',
    label: 'Typewriter',
    detail: 'Monospaced and retro',
    weights: { regular: 'SpaceMono_400Regular', medium: 'SpaceMono_400Regular', semibold: 'SpaceMono_700Bold', bold: 'SpaceMono_700Bold' },
    files: {
      SpaceMono_400Regular: () => require('@expo-google-fonts/space-mono/400Regular/SpaceMono_400Regular.ttf'),
      SpaceMono_700Bold: () => require('@expo-google-fonts/space-mono/700Bold/SpaceMono_700Bold.ttf'),
    },
  },
  {
    id: 'bebas',
    label: 'Poster',
    detail: 'Tall condensed capitals',
    weights: { regular: 'BebasNeue_400Regular', medium: 'BebasNeue_400Regular', semibold: 'BebasNeue_400Regular', bold: 'BebasNeue_400Regular' },
    files: {
      BebasNeue_400Regular: () => require('@expo-google-fonts/bebas-neue/400Regular/BebasNeue_400Regular.ttf'),
    },
  },
  {
    id: 'editorial',
    label: 'Editorial',
    detail: 'A magazine italic',
    // One weight only (and it's loaded at launch), so every weight is the same.
    weights: { regular: fonts.serif, medium: fonts.serif, semibold: fonts.serif, bold: fonts.serif },
    files: null,
  },
];
export const DEFAULT_APP_FONT = 'signature';
export const fontById = (id) => APP_FONTS.find((f) => f.id === id) ?? APP_FONTS[0];

/** The family a font uses for one weight ('regular' | 'medium' | 'semibold' | 'bold'). */
export const familyOf = (font, role) => font.weights[role] ?? font.weights.regular;

const loaded = new Set(['signature', 'editorial']);
const pending = new Map();

/**
 * Registers a font's faces (all four weights, or just the headline one for a
 * preview). Resolves when they can be drawn; never rejects, so a missing face
 * just leaves the house font in place.
 */
export function loadAppFont(id, { preview = false } = {}) {
  const font = fontById(id);
  if (!font.files || loaded.has(font.id)) return Promise.resolve(true);
  const names = preview ? [font.weights.semibold] : Object.keys(font.files);
  const key = `${font.id}:${preview ? 'p' : 'a'}`;
  if (!pending.has(key)) {
    const map = {};
    for (const n of names) if (font.files[n] && !Font.isLoaded(n)) map[n] = font.files[n]();
    pending.set(
      key,
      Font.loadAsync(map)
        .then(() => {
          if (!preview) loaded.add(font.id);
          return true;
        })
        .catch(() => {
          pending.delete(key);
          return false;
        }),
    );
  }
  return pending.get(key);
}

const FontContext = createContext(null);
const fallback = { fontId: DEFAULT_APP_FONT, font: APP_FONTS[0], ready: true, headlineFont: APP_FONTS[0].weights.semibold, options: APP_FONTS, choose: () => {} };

/** Remembers the member's chosen typeface across launches. */
export function FontProvider({ children }) {
  const [fontId, setFontId] = useState(DEFAULT_APP_FONT);
  // The chosen face is only worn once it's registered; until then the house font stays.
  const [ready, setReady] = useState(true);
  const adopt = useCallback((id) => {
    const next = fontById(id).id;
    if (loaded.has(next)) {
      setFontId(next);
      setReady(true);
      return;
    }
    setReady(false);
    setFontId(next);
    loadAppFont(next).then((ok) => setReady(ok));
  }, []);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (alive && raw && APP_FONTS.some((f) => f.id === raw)) adopt(raw);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [adopt]);
  const choose = useCallback(
    (id) => {
      adopt(id);
      AsyncStorage.setItem(KEY, fontById(id).id).catch(() => {});
    },
    [adopt],
  );
  const value = useMemo(() => {
    const font = fontById(fontId);
    return { fontId, font, ready, headlineFont: ready ? font.weights.semibold : APP_FONTS[0].weights.semibold, options: APP_FONTS, choose };
  }, [fontId, ready, choose]);
  return <FontContext.Provider value={value}>{children}</FontContext.Provider>;
}

/** The font picker: id, the chosen font, the options and a setter. Safe outside the provider. */
export function useAppFont() {
  return useContext(FontContext) ?? fallback;
}

/** Just the chosen headline family, for a style; falls back to Signature outside the provider. */
export function useHeadlineFont() {
  return useAppFont().headlineFont;
}
