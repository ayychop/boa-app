import { createContext, forwardRef, useContext, useMemo } from 'react';
import { StyleSheet, Text as RNText, TextInput as RNTextInput } from 'react-native';
import { familyOf, ROLE_OF, useAppFont } from '../context/FontContext';

// The member's chosen typeface, worn in three places only: the chat thread,
// the Hub profile page and profile settings. Those screens are wrapped in
// <FontScope>, and the text inside them is this Text (and TextInput) instead
// of React Native's. Outside a scope, or with the BOA house face chosen, it is
// React Native's Text exactly, so nothing else in the app can ever change.
//
// Inside a scope a house body face (Manrope, Plus Jakarta) becomes the same
// weight of the chosen face. The mono slate labels, the serif flourish, the
// Space Grotesk timestamps and anything else with its own face are left alone.

const Scope = createContext(null);

/** Wraps a screen: its text wears the chosen typeface. */
export function FontScope({ children }) {
  const { font, ready } = useAppFont();
  const value = useMemo(() => (font.files && ready ? font : null), [font, ready]);
  return <Scope.Provider value={value}>{children}</Scope.Provider>;
}

/** The chosen font for the surrounding scope, or null (house face, or no scope). */
export const useScopedFont = () => useContext(Scope);

const weightRole = (w) => {
  const n = w === 'bold' ? 700 : w === 'normal' || w == null ? 400 : Number(w);
  return n >= 700 ? 'bold' : n >= 600 ? 'semibold' : n >= 500 ? 'medium' : 'regular';
};

/** The style that dresses a text style in the font, or null if it should be left alone. */
export function scopedStyle(font, style) {
  if (!font) return null;
  const flat = StyleSheet.flatten(style) || {};
  const own = flat.fontFamily;
  // A face of its own (mono, serif, a timestamp's grotesk) stays as designed.
  if (own && !(own in ROLE_OF)) return null;
  const role = own ? ROLE_OF[own] : weightRole(flat.fontWeight);
  return { fontFamily: familyOf(font, role), fontWeight: 'normal' };
}

/** React Native's Text, in the chosen typeface inside a FontScope. */
const Text = forwardRef(function Text({ style, ...props }, ref) {
  const font = useContext(Scope);
  if (!font) return <RNText ref={ref} style={style} {...props} />;
  const dressed = scopedStyle(font, style);
  return <RNText ref={ref} style={dressed ? [style, dressed] : style} {...props} />;
});

/** React Native's TextInput, in the chosen typeface inside a FontScope. */
export const TextInput = forwardRef(function TextInput({ style, ...props }, ref) {
  const font = useContext(Scope);
  if (!font) return <RNTextInput ref={ref} style={style} {...props} />;
  const dressed = scopedStyle(font, style);
  return <RNTextInput ref={ref} style={dressed ? [style, dressed] : style} {...props} />;
});

export default Text;
