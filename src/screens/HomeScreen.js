import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { featuredProduction, productions, talent } from '../data/boaContent';
import { podcasts } from '../data/podcasts';
import { fetchTier1Stations } from '../api/radio';
import { usePlayer } from '../context/PlayerContext';
import { useMedia } from '../context/MediaContext';
import { useForms } from '../context/FormsContext';
import BoaLogo from '../components/BoaLogo';
import Headshot from '../components/Headshot';
import Poster, { metaLine } from '../components/Poster';
import { heroArt } from '../components/HeroArt';
import PodcastCover from '../components/PodcastCover';
import StationLogo from '../components/StationLogo';
import { Button, Fog, LogoWatermark, PulseDot, SectionHeader, Slate, Tappable, Viewfinder } from '../components/ui';
import useBottomSpace from '../hooks/useBottomSpace';
import useLayout from '../hooks/useLayout';
import { useDisplay } from '../context/DisplayContext';
import { DISPLAY_BUTTON_SPACE, DISPLAY_BUTTON_WIDTH } from '../components/display/DisplayMenu';
import MiniPlayer, { useMiniPlayerSpace } from '../components/MiniPlayer';
import { colors, fonts, space, type } from '../theme';

const METAL = ['#F2F2F4', '#8A8A90', '#FAFAFB', '#5E5E64', '#D9D9DD'];

function Hero({ production, width, height, clearRight, bottomInset = 0, topInset = 0 }) {
  const insets = useSafeAreaInsets();
  const media = useMedia();
  const reduceMotion = useReducedMotion();
  const zoom = useSharedValue(1);

  // Slow Ken Burns push-in on the key art.
  useEffect(() => {
    if (reduceMotion) return;
    zoom.value = withRepeat(withTiming(1.09, { duration: 14000, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [reduceMotion, zoom]);
  const zoomStyle = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }));
  const { node: art, titleInFrame, titleBottom } = heroArt(production, width, height, zoomStyle);
  // Lift the poster so its baked-in title clears the text block below it.
  // The Ken Burns zoom pushes the title down a little, so allow for that too.
  const [bodyTop, setBodyTop] = useState(null);
  const zoomDrift = reduceMotion || titleBottom == null ? 0 : (titleBottom - height / 2) * 0.09;
  const lift = titleBottom != null && bodyTop != null ? Math.min(0, bodyTop - space.xl - titleBottom - zoomDrift) : 0;

  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      <View style={[StyleSheet.absoluteFill, { transform: [{ translateY: lift }] }]}>{art}</View>
      <Fog opacity={0.16} />
      <LinearGradient
        colors={['rgba(5,5,6,0.7)', 'rgba(5,5,6,0.05)', 'rgba(5,5,6,0.55)', colors.bg]}
        locations={[0, 0.3, 0.68, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Soft-focus wordmark over the key art: felt more than seen. */}
      <LogoWatermark
        height={Math.round(Math.min(width * 0.8, 760) / (1398 / 826))}
        opacity={0.09}
        blur={3}
        style={{ left: (width - Math.min(width * 0.8, 760)) / 2, top: height * 0.22 }}
      />
      <Viewfinder inset={16} />

      <View
        style={[styles.heroTop, { top: insets.top + space.xl + topInset }, clearRight && { right: space.xl + 8 + DISPLAY_BUTTON_WIDTH }]}
      >
        <View>
          <View style={styles.logoRow}>
            <BoaLogo height={30} />
            <PulseDot size={7} style={styles.vybDot} />
          </View>
          {width >= 600 && (
            <Slate color={colors.gold} style={{ marginTop: 6 }}>
              Best of all networks
            </Slate>
          )}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6, flexShrink: 1 }}>
          <Slate dot>Scene 01 · Take 01</Slate>
          <Slate>{width >= 600 ? '2.39 : 1 · United Kingdom' : '2.39 : 1 · UK'}</Slate>
        </View>
      </View>

      <Animated.View
        entering={FadeInDown.delay(150).springify().damping(18)}
        style={[styles.heroBody, { bottom: space.xxl + bottomInset }]}
        onLayout={(e) => setBodyTop(e.nativeEvent.layout.y)}
      >
        <Slate color={colors.gold} lines={2}>
          BOA Original · {metaLine(production)}
        </Slate>
        {/* When the art's own title is in frame, don't paint it twice; keep
            it for screen readers. */}
        <Text style={titleInFrame ? styles.srOnly : styles.heroTitle} accessibilityRole="header">
          {production.title}
        </Text>
        <Text style={[type.bodyMuted, { maxWidth: 560 }]} numberOfLines={3}>
          {production.logline}
        </Text>
        <View style={styles.heroActions}>
          {production.episodes[0] && (
            <Button label="Episode 1" icon="play" onPress={() => media.openEpisode(production)} />
          )}
          <Button
            label="Watch Trailer"
            icon="film-outline"
            variant={production.episodes[0] ? 'ghost' : 'primary'}
            onPress={() => media.openTrailer(production)}
          />
        </View>
      </Animated.View>
    </View>
  );
}

function Row({ children }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowContent}>
      {children}
    </ScrollView>
  );
}

function TrendingStation({ station, onPress, live }) {
  return (
    <Tappable onPress={() => onPress(station)} style={styles.station} accessibilityRole="button" accessibilityLabel={`Play ${station.name}`}>
      <LinearGradient colors={METAL} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ring}>
        <StationLogo station={station} size={84} rounded={42} fit="cover" />
      </LinearGradient>
      {live && (
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      )}
      <Text style={styles.stationName} numberOfLines={1}>
        {station.name}
      </Text>
    </Tappable>
  );
}

export default function HomeScreen({ navigation }) {
  const { width, height } = useLayout();
  const insets = useSafeAreaInsets();
  // Split View: the hero holds the left pane, the rows scroll on the right.
  const { split, unfolded } = useDisplay();
  const paneWidth = split ? width / 2 : width;
  const bottom = useBottomSpace(space.xxl);
  const miniPlayerSpace = useMiniPlayerSpace();
  const isFocused = useIsFocused();
  const player = usePlayer();
  const media = useMedia();
  const forms = useForms();
  const [trending, setTrending] = useState(null);

  // Curated Tier 1 only: premium R&B / Hip Hop that's been test-played and
  // streams directly in the app, so the first tap always just plays.
  useEffect(() => {
    let alive = true;
    fetchTier1Stations({ limit: 5 })
      .then((s) => alive && setTrending(s))
      .catch(() => alive && setTrending([]));
    return () => {
      alive = false;
    };
  }, []);

  const playStation = (station) => {
    player.play(station, trending);
    navigation.navigate('Radio', { genre: station.genre, station });
  };

  const heroHeight = Math.min(Math.max(height * 0.78, 520), 820);
  const posterWidth = Math.min(Math.round(paneWidth * 0.72), 340);

  const sections = (
    <>
      <View style={styles.section}>
        <SectionHeader
          index="01"
          kicker="R&B · Hip Hop · Ghana · Nigeria"
          title="Trending on BOA Radio"
          action="Open radio"
          onAction={() => navigation.navigate('Radio')}
        />
        {trending === null ? (
          <View style={styles.tuning}>
            <ActivityIndicator color={colors.textMuted} />
            <Slate>Tuning the premium stations…</Slate>
          </View>
        ) : trending.length === 0 ? (
          <Text style={[type.bodyMuted, { paddingHorizontal: space.xl }]}>Stations are off air right now.</Text>
        ) : (
          <Row>
            {trending.map((s, i) => (
              <Animated.View key={s.id} entering={FadeIn.delay(i * 70)}>
                <TrendingStation
                  station={s}
                  onPress={playStation}
                  live={player.current?.id === s.id && player.isPlaying}
                />
              </Animated.View>
            ))}
          </Row>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader
          index="02"
          kicker="Productions"
          title="BOA Originals"
          action="See all"
          onAction={() => navigation.navigate('Originals')}
        />
        <Row>
          {productions.slice(0, 5).map((p) => (
            <Tappable key={p.id} onPress={() => navigation.navigate('Originals')} accessibilityRole="button" accessibilityLabel={p.title}>
              <Poster production={p} width={posterWidth} ratio={16 / 9} />
            </Tappable>
          ))}
        </Row>
      </View>

      <View style={styles.section}>
        <SectionHeader index="03" kicker="Mindset · Mood · Motivation · Tech" title="BOA Podcasts" />
        <Row>
          {podcasts.map((pod, i) => {
            const live = player.current?.podcastId === pod.id && player.isPlaying;
            return (
              <Animated.View key={pod.id} entering={FadeIn.delay(i * 70)}>
                <Tappable
                  onPress={() => media.openPodcast(pod)}
                  style={styles.podcast}
                  accessibilityRole="button"
                  accessibilityLabel={`${pod.title} podcast`}
                >
                  <PodcastCover podcast={pod} size={148} rounded={18} />
                  {live && (
                    <View style={[styles.liveBadge, styles.podLive]}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveText}>PLAYING</Text>
                    </View>
                  )}
                  <Text style={styles.podTitle} numberOfLines={1}>
                    {pod.title}
                  </Text>
                  <Text style={styles.personRole} numberOfLines={1}>
                    {pod.category} · {pod.author}
                  </Text>
                </Tappable>
              </Animated.View>
            );
          })}
        </Row>
      </View>

      <View style={styles.section}>
        <SectionHeader
          index="04"
          kicker="The roster"
          title="Our Talent"
          action="See all"
          onAction={() => navigation.navigate('Talent')}
        />
        <Row>
          {talent.map((person) => (
            <Tappable
              key={person.id}
              onPress={() => navigation.navigate('Talent', { talentId: person.id })}
              style={styles.person}
              accessibilityRole="button"
              accessibilityLabel={`${person.name}, ${person.role}`}
            >
              <Headshot person={person} width={96} round />
              <Text style={styles.personName} numberOfLines={1}>
                {person.name}
              </Text>
              <Text style={styles.personRole} numberOfLines={1}>
                {person.role}
              </Text>
            </Tappable>
          ))}
        </Row>
      </View>

      <View style={styles.mission}>
        <Fog opacity={0.28} />
        <Viewfinder inset={12} size={12} />
        <Slate dot>05 · The mission</Slate>
        <Text style={[type.h1, { marginTop: space.md }]}>
          Talent is everywhere. <Text style={type.serif}>Opportunity is not.</Text>
        </Text>
        <Text style={[type.bodyMuted, { marginTop: space.md }]}>
          BOA Network exists to close that gap with real roles, on real productions, for people who were never handed a
          way in.
        </Text>
        <View style={styles.barriers}>
          {['Ethnicity', 'Connections', 'Clout', 'Money'].map((b, i) => (
            <View key={b} style={styles.barrier}>
              <Slate>Not a barrier · 0{i + 1}</Slate>
              <Text style={styles.barrierText}>{b}</Text>
            </View>
          ))}
        </View>
        <Button label="Get seen" icon="arrow-forward" onPress={forms.openGetSeen} style={{ alignSelf: 'flex-start', marginTop: space.xl }} />
      </View>
    </>
  );

  // On Home the mini player docks at the top, under the status bar, and the
  // hero's header moves down to make room for it.
  const topInset = player.current ? miniPlayerSpace : 0;
  // Only while Home is the tab on screen; elsewhere the tab bar carries it,
  // and a second copy would poll what's playing twice.
  const topPlayer = isFocused && (
    <View
      pointerEvents="box-none"
      style={[
        styles.topPlayer,
        { top: insets.top + space.sm, height: miniPlayerSpace },
        // Unfolded (either layout): centred on the whole screen, inset the
        // same on both sides so it stays clear of the display pill. Folded,
        // it runs edge to edge.
        unfolded && { left: DISPLAY_BUTTON_WIDTH + space.lg, right: DISPLAY_BUTTON_WIDTH + space.lg },
      ]}
    >
      <MiniPlayer placement="top" maxWidth={unfolded ? 460 : undefined} onOpenRadio={() => navigation.navigate('Radio')} />
    </View>
  );

  if (split) {
    return (
      <Animated.View key="split" entering={FadeIn.duration(360)} style={[styles.screen, styles.split]}>
        <View style={{ width: paneWidth }}>
          <Hero production={featuredProduction} width={paneWidth} height={height} bottomInset={bottom - space.xxl} topInset={topInset} />
        </View>
        <Animated.ScrollView
          entering={FadeInDown.springify().damping(20).stiffness(150)}
          style={{ width: paneWidth }}
          // Starts below the display pill in the top-right corner.
          contentContainerStyle={{ paddingTop: insets.top + space.xl + DISPLAY_BUTTON_SPACE, paddingBottom: bottom }}
          showsVerticalScrollIndicator={false}
        >
          {sections}
        </Animated.ScrollView>
        {topPlayer}
      </Animated.View>
    );
  }

  return (
    <Animated.View key="full" entering={FadeIn.duration(360)} style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottom }} showsVerticalScrollIndicator={false}>
        <Hero production={featuredProduction} width={width} height={heroHeight} clearRight={unfolded} topInset={topInset} />
        {sections}
      </ScrollView>
      {topPlayer}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  split: { flexDirection: 'row' },
  topPlayer: { position: 'absolute', left: 0, right: 0, zIndex: 20 },
  heroTop: {
    position: 'absolute',
    left: space.xl + 8,
    right: space.xl + 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  logoRow: { flexDirection: 'row', alignItems: 'flex-start' },
  // Sits like a lamp off the logo's top-right shoulder.
  vybDot: { marginLeft: 7, marginTop: 2 },
  heroBody: { position: 'absolute', left: space.xl, right: space.xl, bottom: space.xxl, gap: space.md },
  srOnly: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' },
  heroTitle: { fontFamily: fonts.semibold, fontSize: 54, lineHeight: 56, letterSpacing: -2.6, color: colors.text },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.sm },
  section: { marginTop: space.xxl },
  rowContent: { paddingHorizontal: space.xl, gap: 14 },
  station: { width: 104, alignItems: 'center' },
  ring: { width: 98, height: 98, borderRadius: 49, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 10px 24px rgba(0,0,0,0.5)' },
  liveBadge: {
    position: 'absolute',
    top: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.live,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.live },
  liveText: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1.2, color: colors.live },
  stationName: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.text, marginTop: 10, maxWidth: 104 },
  person: { width: 104, alignItems: 'center' },
  tuning: { height: 120, alignItems: 'center', justifyContent: 'center', gap: space.md },
  podcast: { width: 148 },
  podLive: { top: 10, left: 10 },
  podTitle: { fontFamily: fonts.semibold, fontSize: 13.5, color: colors.text, marginTop: 10 },
  personName: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text, marginTop: 10, maxWidth: 104 },
  personRole: { fontFamily: fonts.medium, fontSize: 11, color: colors.textFaint, marginTop: 2 },
  mission: {
    marginTop: space.xxxl,
    marginHorizontal: space.xl,
    padding: space.xl,
    paddingTop: space.xxl,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  barriers: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, marginTop: space.xl },
  barrier: { minWidth: 130, gap: 6 },
  barrierText: { fontFamily: fonts.semibold, fontSize: 19, color: colors.text, letterSpacing: -0.4, textDecorationLine: 'line-through', textDecorationColor: colors.gold },
});
