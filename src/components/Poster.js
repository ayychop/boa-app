import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Fog, Slate } from './ui';
import { fillFrame, toSource } from './HeroArt';
import { colors, fonts, radius } from '../theme';

export function metaLine(p) {
  return [p.format, p.genres.join('/'), p.year].filter(Boolean).join(' · ');
}

/**
 * Production artwork. Without an image it renders the site's own placeholder
 * treatment: fogged charcoal, a gold glow and slate labels.
 */
export default function Poster({ production, width, ratio = 16 / 9, showTitle = true, rounded = radius.md, fit = 'cover' }) {
  const height = Math.round(width / ratio);
  const portrait = ratio < 1;
  const soon = production.status === 'coming-soon';
  // Tall cards use the portrait poster, landscape ones the backdrop. Both
  // crop cleanly with `cover` (the baked-in title spans the width and sits
  // mid-frame), so it isn't captioned with the title a second time.
  const art = toSource(portrait ? production.poster ?? production.backdrop ?? production.image : production.backdrop ?? production.image ?? production.poster);
  const titled = !!art && !!production.titleInArt;

  return (
    <View style={[styles.frame, { width, height, borderRadius: rounded }]}>
      {art ? (
        fit === 'contain' ? (
          // The whole artwork, letterboxed over a blurred copy of itself.
          <>
            <Image source={art} style={[fillFrame, { opacity: 0.5 }]} resizeMode="cover" blurRadius={24} />
            <Image source={art} style={fillFrame} resizeMode="contain" />
          </>
        ) : (
          <Image source={art} style={fillFrame} resizeMode="cover" />
        )
      ) : (
        <>
          <LinearGradient
            colors={['rgba(226,168,75,0.30)', 'rgba(226,168,75,0.04)', 'transparent']}
            start={{ x: 0.85, y: 0 }}
            end={{ x: 0.1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Fog opacity={0.3} />
          <View style={styles.placeholderTop}>
            <Slate color={colors.gold}>Best of all networks</Slate>
            <Slate style={{ opacity: 0.6, marginTop: 6 }}>{portrait ? 'Poster · 2:3' : 'Still · 16:9'}</Slate>
          </View>
        </>
      )}

      {showTitle && !(titled && !portrait) && (
        <LinearGradient
          colors={['transparent', 'rgba(5,5,6,0.55)', 'rgba(5,5,6,0.95)']}
          locations={[0.3, 0.65, 1]}
          style={styles.scrim}
        >
          {soon && <Slate color={colors.gold} dot style={{ marginBottom: 6 }}>Coming soon</Slate>}
          {!titled && (
            <Text style={[styles.title, { fontSize: Math.max(15, Math.min(26, width / 11)) }]} numberOfLines={2}>
              {production.title}
            </Text>
          )}
          {!!metaLine(production) && (
            <Text style={styles.meta} numberOfLines={1}>
              {metaLine(production)}
            </Text>
          )}
        </LinearGradient>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  placeholderTop: { position: 'absolute', top: 14, left: 14, right: 14 },
  scrim: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', padding: 14 },
  title: { fontFamily: fonts.semibold, color: colors.text, letterSpacing: -0.6 },
  meta: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textMuted, marginTop: 3 },
});
