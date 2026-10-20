export const colors = {
  bg: '#0B0B0D',
  surface: '#151518',
  surfaceRaised: '#1E1E23',
  border: 'rgba(255,255,255,0.08)',
  text: '#F5F5F7',
  textMuted: '#A1A1AA',
  textFaint: '#63636B',
  accent: '#E50914',
  accentSoft: 'rgba(229,9,20,0.16)',
  live: '#1ED760',
};

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const type = {
  display: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6, color: colors.text },
  title: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
  body: { fontSize: 15, fontWeight: '500', color: colors.text },
  caption: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
  overline: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
};
