import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fonts } from '../theme';

// A curated choice of headline typeface for the member's own profile name and
// the app's section titles. Every option is a family already bundled with the
// app (src/theme.js, loaded in App.js), so nothing new has to load and the
// choice can never break the BOA identity: the mono slate labels, the serif
// flourish and the wordmark are never governed by it. Deliberately few, so
// the app always still looks like BOA.
const KEY = 'boa.appFont.v1';

export const APP_FONTS = [
  { id: 'signature', label: 'Signature', detail: 'The BOA house face', family: fonts.semibold },
  { id: 'rounded', label: 'Rounded', detail: 'Soft and friendly', family: fonts.chatBold },
  { id: 'technical', label: 'Technical', detail: 'Precise and modern', family: fonts.stamp },
  { id: 'editorial', label: 'Editorial', detail: 'A magazine italic', family: fonts.serif },
];
export const DEFAULT_APP_FONT = 'signature';
export const fontById = (id) => APP_FONTS.find((f) => f.id === id) ?? APP_FONTS[0];

const FontContext = createContext(null);
const fallback = { fontId: DEFAULT_APP_FONT, headlineFont: fontById(DEFAULT_APP_FONT).family, options: APP_FONTS, choose: () => {} };

/** Remembers the member's chosen headline typeface across launches. */
export function FontProvider({ children }) {
  const [fontId, setFontId] = useState(DEFAULT_APP_FONT);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (alive && raw && APP_FONTS.some((f) => f.id === raw)) setFontId(raw);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const choose = useCallback((id) => {
    const next = fontById(id).id;
    setFontId(next);
    AsyncStorage.setItem(KEY, next).catch(() => {});
  }, []);
  const value = useMemo(() => ({ fontId, headlineFont: fontById(fontId).family, options: APP_FONTS, choose }), [fontId, choose]);
  return <FontContext.Provider value={value}>{children}</FontContext.Provider>;
}

/** The font picker: id, the chosen family, the options and a setter. Safe outside the provider. */
export function useAppFont() {
  return useContext(FontContext) ?? fallback;
}

/** Just the chosen headline family, for a style; falls back to Signature outside the provider. */
export function useHeadlineFont() {
  return useAppFont().headlineFont;
}
