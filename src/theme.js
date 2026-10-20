// Palette and type follow boanetworks.com: near-black stage, warm paper-white
// text, BOA gold, Manrope headlines, JetBrains Mono slate labels and an
// Instrument Serif italic for the occasional flourish.
export const colors = {
  bg: '#050506',
  bgElevated: '#0B0B0D',
  surface: '#111113',
  surfaceRaised: '#1A1A1D',
  border: 'rgba(243,239,232,0.09)',
  borderStrong: 'rgba(243,239,232,0.18)',
  text: '#F3EFE8',
  textMuted: 'rgba(217,212,200,0.78)',
  textFaint: 'rgba(217,212,200,0.42)',
  gold: '#E2A84B',
  goldDeep: '#9A6A22',
  goldSoft: 'rgba(226,168,75,0.14)',
  accent: '#E2A84B',
  live: '#1ED760',
};

export const radius = { sm: 8, md: 12, lg: 18, xl: 26, pill: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };

export const fonts = {
  light: 'Manrope_300Light',
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
  serif: 'InstrumentSerif_400Regular_Italic',
};

// Custom fonts carry their weight in the family name, so these presets never
// set fontWeight (Android would otherwise fall back to the system font).
export const type = {
  display: { fontFamily: fonts.semibold, fontSize: 44, lineHeight: 46, letterSpacing: -2, color: colors.text },
  h1: { fontFamily: fonts.semibold, fontSize: 32, lineHeight: 36, letterSpacing: -1.3, color: colors.text },
  title: { fontFamily: fonts.semibold, fontSize: 21, lineHeight: 26, letterSpacing: -0.6, color: colors.text },
  body: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: colors.text },
  bodyMuted: { fontFamily: fonts.regular, fontSize: 14.5, lineHeight: 22, color: colors.textMuted },
  caption: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textMuted },
  // The site's "SCENE 01 · TAKE 01" slate labels.
  slate: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: 2.3,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  serif: { fontFamily: fonts.serif, color: colors.gold },
};
