import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
import PodcastCover from '../components/PodcastCover';
import StationLogo from '../components/StationLogo';
import { Button, Fog, SectionHeader, Slate, Tappable, Viewfinder } from '../components/ui';
import useBottomSpace from '../hooks/useBottomSpace';
import { colors, fonts, space, type } from '../theme';

const METAL = ['#F2F2F4', '#8A8A90', '#FAFAFB', '#5E5E64', '#D9D9DD'];

function Hero({ production, width, height }) {
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

  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      <Animated.Image source={{ uri: production.image }} resizeMode="cover" style={[StyleSheet.absoluteFill, zoomStyle]} />
      <Fog opacity={0.16} />
      <LinearGradient
        colors={['rgba(5,5,6,0.7)', 'rgba(5,5,6,0.05)', 'rgba(5,5,6,0.55)', colors.bg]}
        locations={[0, 0.3, 0.68, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Viewfinder inset={16} />

      <View style={[styles.heroTop, { top: insets.top + space.xl }]}>
        <View>
          <BoaLogo height={30} />
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

      <Animated.View entering={FadeInDown.delay(150).springify().damping(18)} style={styles.heroBody}>
        <Slate color={colors.gold} lines={2}>
          BOA Original · {metaLine(production)}
        </Slate>
        <Text style={styles.heroTitle} accessibilityRole="header">
          {production.title}
        </Text>
        <Text style={[type.bodyMuted, { maxWidth: 560 }]} numberOfLines={3}>
          {production.logline}
        </Text>
        <View style={styles.heroActions}>
          <Button label="Watch Trailer" icon="play" onPress={() => media.openTrailer(production)} />
          {production.episodes[0] && (
            <Button label="Episode 1" icon="tv-outline" variant="ghost" onPress={() => media.openEpisode(production)} />
          )}
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
  const { width, height } = useWindowDimensions();
  const bottom = useBottomSpace(space.xxl);
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
    player.play(station);
    navigation.navigate('Radio', { genre: station.genre, station });
  };

  const heroHeight = Math.min(Math.max(height * 0.78, 520), 820);
  const posterWidth = Math.min(Math.round(width * 0.72), 340);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottom }} showsVerticalScrollIndicator={false}>
        <Hero production={featuredProduction} width={width} height={heroHeight} />

        <View style={styles.section}>
          <SectionHeader
            index="01"
            kicker="R&B · Hip Hop"
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
          <SectionHeader index="03" kicker="Listen" title="BOA Podcasts" />
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
                      {pod.category} · {pod.episodes.length} episodes
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  heroTop: {
    position: 'absolute',
    left: space.xl + 8,
    right: space.xl + 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroBody: { position: 'absolute', left: space.xl, right: space.xl, bottom: space.xxl, gap: space.md },
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
