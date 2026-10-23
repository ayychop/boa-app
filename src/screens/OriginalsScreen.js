import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { featuredProduction, productions } from '../data/boaContent';
import { useMedia } from '../context/MediaContext';
import { usePlayer } from '../context/PlayerContext';
import { useDisplay } from '../context/DisplayContext';
import { DISPLAY_BUTTON_SPACE, DISPLAY_BUTTON_WIDTH } from '../components/display/DisplayMenu';
import YouTubePlayer from '../components/media/YouTubePlayer';
import VideoPlayer from '../components/media/VideoPlayer';
import Poster, { metaLine } from '../components/Poster';
import { BACKDROP_TITLE_TOP, fillFrame, heroArt, toSource } from '../components/HeroArt';
import { Button, Fog, SectionHeader, Slate, Tappable, Viewfinder } from '../components/ui';
import useBottomSpace from '../hooks/useBottomSpace';
import useLayout, { WIDE } from '../hooks/useLayout';
import { colors, fonts, space, type } from '../theme';

const GAP = 14;

function Featured({ production, width, clearRight }) {
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
  const height = stacked
    ? Math.round(Math.min((width * 16) / 9, window.height * 0.56))
    : Math.round(Math.min(natural, window.height * 0.5, BACKDROP_TITLE_TOP * width - space.md));
  const poster = production.poster ?? production.backdrop;
  const { node: art, titleInFrame } = stacked && poster
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
        <LinearGradient
          colors={['rgba(5,5,6,0.55)', 'rgba(5,5,6,0)', 'rgba(5,5,6,0)', colors.bg]}
          locations={[0, 0.25, 0.8, 1]}
          style={StyleSheet.absoluteFill}
        />
        <Viewfinder inset={16} />
        <View
          style={[styles.featuredTop, { top: insets.top + space.xl }, clearRight && { right: space.xl + 8 + DISPLAY_BUTTON_WIDTH }]}
        >
          <Slate dot>02 · Productions</Slate>
          <Slate>The slate</Slate>
        </View>
      </View>
      <View style={styles.featuredBody}>
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
          {production.episodes[0] && (
            <Button label="Play Episode 1" icon="play" onPress={() => media.openEpisode(production)} />
          )}
          <Button label="Watch Trailer" icon="film-outline" variant="ghost" onPress={() => media.openTrailer(production)} />
        </View>
      </View>
    </View>
  );
}

function EpisodeCard({ production, episode, width }) {
  const media = useMedia();
  return (
    <Tappable onPress={() => media.openEpisode(production, episode)} accessibilityRole="button" accessibilityLabel={`Play ${episode.title}`}>
      <Poster production={{ ...production, backdrop: episode.image, status: 'available' }} width={width} showTitle={false} fit="contain" />
      <View style={styles.episodeCaption}>
        <Slate>Ep 01</Slate>
        <Text style={styles.episodeTitle}>{episode.title}</Text>
      </View>
    </Tappable>
  );
}

// Everything watchable, in slate order: each production's official trailer
// first, then its episodes from Episode 1; productions with neither are
// listed as coming soon.
const CATALOGUE = productions.flatMap((p) => {
  const items = [];
  if (p.trailerYouTubeId) items.push({ key: `${p.id}-trailer`, production: p, kind: 'trailer', label: 'Official Trailer' });
  p.episodes.forEach((episode) => items.push({ key: episode.id, production: p, kind: 'episode', episode, label: episode.title }));
  if (!items.length) items.push({ key: p.id, production: p, kind: 'soon', label: 'Coming soon' });
  return items;
});

function sourceFor(item) {
  if (item.kind === 'trailer') return { youTubeId: item.production.trailerYouTubeId };
  if (item.kind === 'episode') return item.episode.videoUrl ? { videoUrl: item.episode.videoUrl } : { youTubeId: item.episode.youTubeId };
  return null;
}

const thumbOf = (item) =>
  item.kind === 'episode' ? { ...item.production, backdrop: item.episode.image, status: 'available' } : item.production;

// Split View's left pane: the screening room, inline. Nothing plays until
// it's asked to (and live audio pauses when it is).
function InlineScreening({ item, playing, onPlay, width, bottom }) {
  const insets = useSafeAreaInsets();
  const videoWidth = width - space.xl * 2;
  const videoHeight = Math.round((videoWidth * 9) / 16);
  const source = sourceFor(item);
  const { production } = item;
  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.xl, paddingHorizontal: space.xl, paddingBottom: bottom }}>
      <Slate dot>Now screening · {item.label}</Slate>
      <View style={[styles.screen16x9, { width: videoWidth, height: videoHeight }]}>
        {playing && source?.youTubeId ? (
          <YouTubePlayer key={source.youTubeId} videoId={source.youTubeId} width={videoWidth} height={videoHeight} />
        ) : playing && source?.videoUrl ? (
          <VideoPlayer uri={source.videoUrl} poster={production.image} width={videoWidth} height={videoHeight} />
        ) : (
          <Pressable
            onPress={source ? onPlay : undefined}
            disabled={!source}
            accessibilityRole="button"
            accessibilityLabel={source ? `Play ${production.title}, ${item.label}` : `${production.title}, coming soon`}
          >
            <Poster production={thumbOf(item)} width={videoWidth} showTitle={false} rounded={0} fit="contain" />
            <View style={[styles.playOverlay, source && styles.playCorner]}>
              {source ? (
                <View style={styles.playButton}>
                  <Ionicons name="play" size={24} color={colors.bg} style={{ marginLeft: 3 }} />
                </View>
              ) : (
                <Text style={styles.soonTitle}>
                  Coming <Text style={type.serif}>soon</Text>
                </Text>
              )}
            </View>
          </Pressable>
        )}
      </View>
      <Animated.View key={item.key} entering={FadeIn.duration(300)}>
        <Text style={[type.h1, { marginTop: space.xl }]}>{production.title}</Text>
        {!!metaLine(production) && <Slate style={{ marginTop: 10 }}>{metaLine(production)}</Slate>}
        {production.logline && <Text style={[type.bodyMuted, { marginTop: space.lg }]}>{production.logline}</Text>}
      </Animated.View>
    </ScrollView>
  );
}

// Split View's right pane: the whole slate as a list.
function EpisodeList({ selected, onSelect, width, bottom }) {
  const insets = useSafeAreaInsets();
  let lastProduction = null;
  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: insets.top + space.xl + DISPLAY_BUTTON_SPACE, paddingBottom: bottom }}
      showsVerticalScrollIndicator={false}
    >
      <SectionHeader index="01" kicker="The slate" title="Episodes" />
      <View style={styles.list}>
        {CATALOGUE.map((item, i) => {
          const header = item.production !== lastProduction;
          lastProduction = item.production;
          const active = item.key === selected.key;
          const soon = item.kind === 'soon';
          return (
            <Animated.View key={item.key} entering={FadeInDown.delay(i * 45).springify().damping(20)}>
              {header && <Slate style={styles.listGroup}>{item.production.title}</Slate>}
              <Pressable
                onPress={() => onSelect(item)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${item.production.title}, ${item.label}`}
                style={({ pressed }) => [styles.listRow, active && styles.listRowActive, pressed && { opacity: 0.75 }]}
              >
                {/* Contained, so the art's "MIND STATES UK" title is never cut. */}
                <Poster production={thumbOf(item)} width={Math.min(132, width * 0.3)} showTitle={false} rounded={8} fit="contain" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.listTitle, soon && { color: colors.textFaint }]} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text style={styles.listMeta} numberOfLines={1}>
                    {soon ? 'Not out yet' : item.kind === 'trailer' ? 'Trailer' : metaLine(item.production) || 'Episode'}
                  </Text>
                </View>
                {active && !soon && <Ionicons name="play-circle" size={22} color={colors.gold} />}
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function SplitOriginals({ width, bottom }) {
  const player = usePlayer();
  const [selected, setSelected] = useState(CATALOGUE[0]);
  const [playing, setPlaying] = useState(false);
  const pane = width / 2;
  // Never talk over the film: audio pauses when a video starts.
  const play = () => {
    if (player.isPlaying) player.pause();
    setPlaying(true);
  };
  const select = (item) => {
    setSelected(item);
    if (item.kind === 'soon') setPlaying(false);
    else play();
  };
  return (
    <Animated.View key="split" entering={FadeIn.duration(360)} style={[styles.screen, styles.split]}>
      <View style={{ width: pane }}>
        <InlineScreening item={selected} playing={playing} onPlay={play} width={pane} bottom={bottom} />
      </View>
      <Animated.View entering={FadeInDown.springify().damping(20).stiffness(150)} style={{ width: pane }}>
        <EpisodeList selected={selected} onSelect={select} width={pane} bottom={bottom} />
      </Animated.View>
    </Animated.View>
  );
}

export default function OriginalsScreen() {
  const { width } = useLayout();
  const media = useMedia();
  const bottom = useBottomSpace(space.xxl);
  const { split, unfolded } = useDisplay();
  if (split) return <SplitOriginals width={width} bottom={bottom} />;
  const contentWidth = Math.min(width, 1200);
  const columns = contentWidth < 640 ? 2 : contentWidth < 1000 ? 3 : 4;
  const posterWidth = Math.floor((contentWidth - space.xl * 2 - GAP * (columns - 1)) / columns);
  const featured = featuredProduction;

  return (
    <Animated.View key="full" entering={FadeIn.duration(360)} style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottom }} showsVerticalScrollIndicator={false}>
        <Featured production={featured} width={width} clearRight={unfolded} />

        <View style={[styles.block, { width: contentWidth }]}>
          <SectionHeader index="01" kicker={featured.title} title="Episodes" />
          <View style={styles.row}>
            {featured.episodes.map((ep) => (
              <EpisodeCard key={ep.id} production={featured} episode={ep} width={Math.min(posterWidth * 1.6, 360)} />
            ))}
          </View>
        </View>

        <View style={[styles.block, { width: contentWidth }]}>
          <View style={{ overflow: 'hidden' }}>
            <SectionHeader index="02" kicker="All productions" title="Stories worth the big screen." />
          </View>
          <View style={[styles.grid, { gap: GAP }]}>
            {productions.map((p, i) => (
              <Animated.View key={p.id} entering={FadeInDown.delay(80 * i).springify().damping(18)}>
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
          <Text style={[type.bodyMuted, { marginTop: space.sm }]}>
            Every production on this slate is casting, or will be. Get on our radar before the call goes out.
          </Text>
        </View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  split: { flexDirection: 'row' },
  screen16x9: {
    marginTop: space.md,
    backgroundColor: '#000',
    overflow: 'hidden',
    borderRadius: 12,
    boxShadow: '0px 30px 80px rgba(0,0,0,0.75), 0px 0px 0px 1px rgba(243,239,232,0.08)',
  },
  playOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,5,6,0.25)' },
  // The whole cover art is in frame, title included, so the play button
  // waits in the corner rather than sitting on it.
  playCorner: { alignItems: 'flex-start', justifyContent: 'flex-end', padding: space.md, backgroundColor: 'transparent' },
  playButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold,
    boxShadow: '0px 10px 30px rgba(226,168,75,0.45)',
  },
  soonTitle: { fontFamily: fonts.semibold, fontSize: 26, color: colors.text, letterSpacing: -0.8 },
  list: { paddingHorizontal: space.lg, marginTop: space.sm },
  listGroup: { marginTop: space.lg, marginBottom: space.sm, paddingHorizontal: space.sm },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  listRowActive: { backgroundColor: 'rgba(226,168,75,0.08)', borderColor: 'rgba(226,168,75,0.35)' },
  listTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  listMeta: { fontFamily: fonts.medium, fontSize: 12, color: colors.textFaint, marginTop: 3 },
  featuredTop: { position: 'absolute', left: space.xl + 8, right: space.xl + 8, flexDirection: 'row', justifyContent: 'space-between' },
  featuredBody: { paddingHorizontal: space.xl, paddingTop: space.lg, maxWidth: 680 + space.xl * 2 },
  srOnly: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' },
  featuredTitle: { fontSize: 48, lineHeight: 50, marginTop: space.md },
  logline: { marginTop: space.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.xl },
  block: { alignSelf: 'center', marginTop: space.xxl },
  row: { flexDirection: 'row', gap: GAP, paddingHorizontal: space.xl },
  episodeCaption: { paddingTop: 10, gap: 4 },
  episodeTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
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
