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
 *
 * With artwork the picture runs edge to edge: no border, no letterbox, no
 * panel colour showing at the sides, in portrait and landscape alike.
 */
export default function Poster({ production, width, ratio = 16 / 9, showTitle = true, rounded = radius.md, fit = 'cover' }) {
  const height = Math.round(width / ratio);
  const portrait = ratio < 1;
  const soon = production.status === 'coming-soon';
  // Tall cards use the portrait poster, landscape ones the backdrop. Both
  // crop cleanly with `cover` (the baked-in title spans the width and sits
  // mid-frame), so it isn't captioned with the title a second time.
  const art = toSource(portrait ? (production.poster ?? production.backdrop ?? production.image) : (production.backdrop ?? production.image ?? production.poster));
  const titled = !!art && !!production.titleInArt;

  const caption = showTitle && !(titled && !portrait);
  // Placeholder art carries the brand line at the top, but only on a card
  // tall enough to hold it clear of the caption below. A coming-soon card
  // says "Coming soon" and nothing else.
  const brandLine = !art && !soon && height >= (caption ? 150 : 70);
  const titleSize = Math.max(15, Math.min(26, width / 11));

  return (
    <View style={[styles.frame, art ? styles.framed : styles.placeholder, { width, height, borderRadius: rounded }]}>
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
          <LinearGradient colors={['rgba(226,168,75,0.30)', 'rgba(226,168,75,0.04)', 'transparent']} start={{ x: 0.85, y: 0 }} end={{ x: 0.1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Fog opacity={0.3} />
        </>
      )}
      {caption && <LinearGradient colors={['transparent', 'rgba(5,5,6,0.55)', 'rgba(5,5,6,0.95)']} locations={[0.3, 0.65, 1]} style={StyleSheet.absoluteFill} />}

      {/* Brand line and caption share one column, so however small the
          card, they stack instead of overlapping. */}
      {(brandLine || caption) && (
        <View style={[styles.content, soon && [styles.contentSoon, { paddingTop: Math.round(height * 0.24) }]]} pointerEvents="none">
          {brandLine ? (
            <Slate color={colors.gold} lines={2}>
              Best of all networks
            </Slate>
          ) : soon ? null : (
            <View />
          )}
          {caption && (
            <View style={soon && styles.soonText}>
              {soon && (
                <Slate color={colors.gold} dot style={{ marginBottom: 8 }}>
                  Coming soon
                </Slate>
              )}
              {!titled && (
                <Text style={[styles.title, { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.18) }]} numberOfLines={3}>
                  {production.title}
                </Text>
              )}
              {!!metaLine(production) && (
                <Text style={styles.meta} numberOfLines={3}>
                  {metaLine(production)}
                </Text>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
  },
  // Artwork fills the frame to its very edge: no hairline border, and the
  // stage colour behind it, so an antialiased edge never shows a grey rim.
  framed: { backgroundColor: colors.bg },
  placeholder: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  content: { ...StyleSheet.absoluteFill, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 18, justifyContent: 'space-between' },
  // A Coming Soon card has no artwork and no caption at the foot, so its text
  // rides up to eye level (the upper third) instead of sitting on the floor
  // or dead centre. Its top padding is set from the card's height.
  contentSoon: { justifyContent: 'flex-start' },
  soonText: { alignItems: 'flex-start' },
  title: { fontFamily: fonts.semibold, color: colors.text, letterSpacing: -0.6 },
  meta: { fontFamily: fonts.medium, fontSize: 11.5, lineHeight: 16, color: colors.textMuted, marginTop: 4 },
});
