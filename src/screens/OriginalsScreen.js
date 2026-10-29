import { useEffect } from 'react';
import { Image, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { featuredProduction, productions } from '../data/boaContent';
import { useMedia } from '../context/MediaContext';
import Poster, { metaLine } from '../components/Poster';
import { BACKDROP_TITLE_TOP, fillFrame, heroArt, toSource } from '../components/HeroArt';
import { Button, Fog, SectionHeader, Slate, Tappable, Viewfinder } from '../components/ui';
import useBottomSpace from '../hooks/useBottomSpace';
import useLayout, { WIDE } from '../hooks/useLayout';
import { colors, fonts, radius, space, type } from '../theme';

const GAP = 14;
const CONTENT_MAX = 1200;
// About how tall the copy under the art is (the slate line, title, logline
// and buttons): the art leaves this much room above the tab bar and mini
// player, so Play and Watch Trailer are in view before you scroll.
const BODY_HEIGHT = 250;

function Featured({ production, width, clear = 0 }) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const media = useMedia();
  const wide = width >= 900;
  // Narrow screens (a folded phone's cover screen) show the whole 9:16
  // poster, title and all, so the copy goes underneath it rather than over
  // it. Wider ones get the cinematic crop, capped at half the screen so the
  // buttons below are always in view without scrolling, and stopped short of
  // the backdrop's baked-in title so it never shows half cut off.
  const stacked = width < WIDE;
  const natural = wide ? Math.round(width / 2.39) + insets.top : Math.round(width * 1.68) + insets.top;
  const room = Math.max(window.height * 0.3, window.height - clear - BODY_HEIGHT);
  const height = stacked ? Math.round(Math.min((width * 16) / 9, window.height * 0.56, room)) : Math.round(Math.min(natural, window.height * 0.5, BACKDROP_TITLE_TOP * width - space.md, room));
  const poster = production.poster ?? production.backdrop;
  const { node: art, titleInFrame } =
    stacked && poster
      ? {
          titleInFrame: !!production.titleInArt,
          node: (
            // The whole poster, letterboxed over a blurred copy of itself.
            <>
              <Image source={toSource(poster)} resizeMode="cover" blurRadius={24} style={[fillFrame, { opacity: 0.5 }]} />
              <Image source={toSource(poster)} resizeMode="contain" style={fillFrame} />
            </>
          ),
        }
      : heroArt(production, width, height);

  return (
    <View style={{ width }}>
      <View style={{ width, height, overflow: 'hidden' }}>
        <Animated.View entering={FadeInDown.duration(600)} style={StyleSheet.absoluteFill}>
          {art}
        </Animated.View>
        <LinearGradient colors={['rgba(5,5,6,0.55)', 'rgba(5,5,6,0)', 'rgba(5,5,6,0)', colors.bg]} locations={[0, 0.25, 0.8, 1]} style={StyleSheet.absoluteFill} />
        <Viewfinder inset={16} />
        {/* The gold BOA play badge on the hero: tap it to start the show. */}
        <View pointerEvents="box-none" style={styles.playOverlay}>
          <Tappable
            onPress={() => (production.episodes[0] ? media.openEpisode(production) : media.openTrailer(production))}
            accessibilityRole="button"
            accessibilityLabel={production.episodes[0] ? `Play ${production.title} Episode 1` : `Watch the ${production.title} trailer`}
            testID="originals-hero-play"
          >
            <View style={[styles.playBadge, styles.heroPlay]}>
              <Ionicons name="play" size={34} color={colors.bg} style={{ marginLeft: 4 }} />
            </View>
          </Tappable>
        </View>
        <View style={[styles.featuredTop, { top: insets.top + space.xl }]}>
          <Slate dot>02 · Productions</Slate>
          <Slate>The slate</Slate>
        </View>
      </View>
      {/* The copy lines up with the centred sections below at any width. */}
      <View style={[styles.featuredBody, { width: Math.min(width, CONTENT_MAX), alignSelf: 'center' }]}>
        <Slate color={colors.gold} lines={2}>
          Featured · {metaLine(production)}
        </Slate>
        {/* When the art's own title is in frame it is the title; keep the
            text for screen readers. */}
        <Text style={titleInFrame ? styles.srOnly : [type.display, styles.featuredTitle]} accessibilityRole="header">
          {production.title}
        </Text>
        <Text style={[type.bodyMuted, styles.logline]} numberOfLines={wide ? 3 : 4}>
          {production.logline}
        </Text>
        <View style={styles.actions}>
          {production.episodes[0] && <Button label="Play Episode 1" icon="play" onPress={() => media.openEpisode(production)} />}
          <Button label="Watch Trailer" icon="film-outline" variant="ghost" onPress={() => media.openTrailer(production)} />
        </View>
      </View>
    </View>
  );
}

/** A band of gold light that sweeps across a still now and then. Off under Reduce Motion. */
function GoldSheen({ width, radius: r = radius.md }) {
  const reduce = useReducedMotion();
  const x = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    x.value = withRepeat(withDelay(2400, withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.cubic) })), -1, false);
  }, [reduce, x]);
  const band = width * 0.45;
  const sweep = useAnimatedStyle(() => ({ transform: [{ translateX: -band + x.value * (width + band * 2) }, { skewX: '-20deg' }] }));
  if (reduce) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: r, overflow: 'hidden' }]}>
      <Animated.View style={[styles.sheen, { width: band }, sweep]}>
        <LinearGradient
          colors={['rgba(226,168,75,0)', 'rgba(255,226,160,0.32)', 'rgba(226,168,75,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

function EpisodeCard({ production, episode, width }) {
  const media = useMedia();
  return (
    <Tappable onPress={() => media.openEpisode(production, episode)} accessibilityRole="button" accessibilityLabel={`Play ${episode.title}`}>
      <View>
        {/* Edge to edge: the still fills its frame, no blurred letterbox. */}
        <Poster production={{ ...production, backdrop: episode.image, status: 'available' }} width={width} showTitle={false} fit="cover" />
        {/* The gold BOA play badge, centred over the still, like a premium
            streaming service. A pointer-through overlay: the whole card plays. */}
        <GoldSheen width={width} />
        <View pointerEvents="none" style={styles.playOverlay}>
          <View style={styles.playBadge}>
            <Ionicons name="play" size={26} color={colors.bg} style={{ marginLeft: 3 }} />
          </View>
        </View>
      </View>
      <View style={[styles.episodeCaption, { width }]}>
        <Slate>Ep 01</Slate>
        <Text style={styles.episodeTitle} numberOfLines={2}>
          {episode.title}
        </Text>
      </View>
    </Tappable>
  );
}

export default function OriginalsScreen() {
  const { width } = useLayout();
  const insets = useSafeAreaInsets();
  const media = useMedia();
  // Extra room under the casting card too, so the last of the page scrolls
  // well clear of the mini player.
  const bottom = useBottomSpace(space.xxxl);
  const contentWidth = Math.min(width, CONTENT_MAX);
  // Four across from an unfolded Fold up, so the slate fills one row instead of leaving a lone poster.
  const columns = contentWidth < 640 ? 2 : contentWidth < 800 ? 3 : 4;
  const posterWidth = Math.floor((contentWidth - space.xl * 2 - GAP * (columns - 1)) / columns);
  const featured = featuredProduction;

  return (
    <Animated.View key="full" entering={FadeIn.duration(360)} style={styles.screen}>
      <ScrollView testID="originals-scroll" contentContainerStyle={{ paddingBottom: bottom }} showsVerticalScrollIndicator={false}>
        <Featured production={featured} width={width} clear={bottom} />

        <View style={[styles.block, { width: contentWidth }]}>
          <SectionHeader index="01" kicker={featured.title} title="Episodes" />
          <View style={styles.row}>
            {featured.episodes.map((ep) => (
              <EpisodeCard key={ep.id} production={featured} episode={ep} width={Math.min(posterWidth * 1.6, 360)} />
            ))}
          </View>
        </View>

        <View style={[styles.block, { width: contentWidth }]}>
          {/* No clipping wrapper here: the headline's descenders (the g and p
              in "big screen") need the room, and a tall typeface needs more. */}
          <SectionHeader index="02" kicker="All productions" title="Stories worth the big screen." />
          <View style={[styles.grid, { gap: GAP }]}>
            {productions.map((p, i) => (
              <Animated.View
                key={p.id}
                entering={FadeInDown.delay(80 * i)
                  .springify()
                  .damping(18)}
              >
                <Tappable
                  onPress={() => (p.episodes[0] ? media.openEpisode(p) : media.openTrailer(p))}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.title}${p.status === 'coming-soon' ? ', coming soon' : ''}`}
                >
                  <Poster production={p} width={posterWidth} ratio={2 / 3} />
                </Tappable>
              </Animated.View>
            ))}
          </View>
        </View>

        <View style={[styles.casting, { width: contentWidth - space.xl * 2 }]}>
          <Fog opacity={0.28} />
          <Slate dot>Casting</Slate>
          <Text style={[type.h1, { marginTop: space.md }]}>
            There is a role with <Text style={type.serif}>your name</Text> on it.
          </Text>
          <Text style={[type.bodyMuted, { marginTop: space.sm, maxWidth: 560 }]}>
            Every production on this slate is casting, or will be. Get on our radar before the call goes out.
          </Text>
        </View>
      </ScrollView>
      {/* Titles scrolling up fade out under the clock instead of colliding with it. */}
      <LinearGradient pointerEvents="none" colors={[colors.bg, 'rgba(5,5,6,0)']} style={[styles.scrim, { height: insets.top + space.lg }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  screen: { flex: 1, backgroundColor: colors.bg },
  featuredTop: { position: 'absolute', left: space.xl + 8, right: space.xl + 8, flexDirection: 'row', justifyContent: 'space-between' },
  featuredBody: { paddingHorizontal: space.xl, paddingTop: space.lg },
  srOnly: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' },
  featuredTitle: { fontSize: 48, lineHeight: 50, marginTop: space.md },
  logline: { marginTop: space.md, maxWidth: 680 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.xl },
  block: { alignSelf: 'center', marginTop: space.xxl },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: space.xl },
  episodeCaption: { paddingTop: 10, gap: 4 },
  episodeTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  playOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  playBadge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold,
    borderWidth: 1.5,
    borderColor: 'rgba(255,245,224,0.85)',
    boxShadow: '0px 6px 22px rgba(226,168,75,0.55)',
  },
  heroPlay: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, boxShadow: '0px 8px 32px rgba(226,168,75,0.6)' },
  sheen: { position: 'absolute', top: '-20%', bottom: '-20%', left: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: space.xl },
  casting: {
    marginTop: space.xxxl,
    padding: space.xl,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignSelf: 'center',
  },
});
