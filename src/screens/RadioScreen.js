import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { fetchStationsByTag, GENRES } from '../api/radio';
import { curatedStations } from '../data/radioStations';
import { getStationGlow } from '../api/stationColor';
import { usePlayer } from '../context/PlayerContext';
import useNowPlaying from '../hooks/useNowPlaying';
import RecordCarousel, { carouselItemWidth } from '../components/RecordCarousel';
import GlowField, { FogPlane } from '../components/GlowField';
import Vinyl from '../components/Vinyl';
import { MINI_PLAYER_SPACE } from '../components/MiniPlayer';
import { colors, fonts, radius, space } from '../theme';

const TEXT_BLOCK = 150;
const LIVE_RED = '#F2555A';

function GenrePills({ selected, onSelect }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.pillsScroll}
      contentContainerStyle={styles.pills}
    >
      {GENRES.map((g) => {
        const active = g.tag === selected;
        return (
          <Pressable
            key={g.tag}
            onPress={() => onSelect(g.tag)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.pill, active && styles.pillActive, pressed && { opacity: 0.6 }]}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{g.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// A slow breathing dot: the one piece of constant motion on the stage.
function LiveDot({ color }) {
  const reduceMotion = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    o.value = withRepeat(withTiming(0.35, { duration: 1100, easing: Easing.bezier(0.77, 0, 0.175, 1) }), -1, true);
  }, [reduceMotion, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.liveDot, { backgroundColor: color }, style]} />;
}

function StationText({ station, track, status, meta, compact }) {
  const onAir = status === 'playing';
  return (
    <Animated.View
      key={station.id}
      entering={FadeInDown.springify().damping(18).stiffness(160)}
      exiting={FadeOut.duration(120)}
      style={styles.textBlock}
    >
      <Text style={[styles.name, compact && styles.nameCompact]} numberOfLines={2} accessibilityRole="header">
        {station.name}
      </Text>
      {/* Keyed on the title so a new track crossfades in. */}
      <Animated.View key={track || 'live'} entering={FadeIn.duration(350)} style={styles.trackRow}>
        {track ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            <Text style={styles.subtitleLead}>Now playing: </Text>
            {track}
          </Text>
        ) : (
          <>
            <LiveDot color={onAir ? colors.live : LIVE_RED} />
            <Text style={styles.subtitle}>Live Broadcast</Text>
          </>
        )}
      </Animated.View>
      <Text style={styles.meta} numberOfLines={1}>
        {meta}
      </Text>
    </Animated.View>
  );
}

function Notice({ title, body, action, onAction }) {
  return (
    <Animated.View entering={FadeIn.duration(250)} style={styles.textBlock}>
      <Text style={[styles.name, styles.nameCompact]}>{title}</Text>
      {body && <Text style={[styles.subtitle, { textAlign: 'center' }]}>{body}</Text>}
      {action && (
        <Pressable onPress={onAction} style={({ pressed }) => [styles.retry, pressed && { opacity: 0.8 }]}>
          <Text style={styles.retryText}>{action}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

export default function RadioScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const player = usePlayer();
  const isFocused = useIsFocused();
  // Carousel position, shared with the parallax layers behind it.
  const scrollX = useSharedValue(0);
  const [glows, setGlows] = useState({});
  const [genre, setGenre] = useState(GENRES[0].tag);
  const [index, setIndex] = useState(0);
  const [data, setData] = useState({ status: 'loading', stations: [] });
  const [layout, setLayout] = useState(null);
  const requestRef = useRef(0);
  // A station to centre once its genre's list has loaded (from Home).
  const pendingFocus = useRef(null);

  // Put the list on screen, centring a station Home asked for. A curated
  // pick from Home may not be in this genre's list; give it the first record
  // rather than leaving it off the carousel.
  const show = useCallback((stations) => {
    const wanted = pendingFocus.current;
    pendingFocus.current = null;
    let list = stations;
    let at = 0;
    if (wanted) {
      const i = stations.findIndex((s) => s.id === wanted.id);
      if (i < 0) list = [wanted, ...stations];
      at = Math.max(i, 0);
    }
    setIndex(at);
    setData({ status: 'ready', stations: list });
  }, []);

  const load = useCallback(
    async (tag) => {
      const id = ++requestRef.current;
      // Curated genres are static: they render immediately, no network.
      const curated = curatedStations(tag);
      if (curated) {
        show(curated);
        return;
      }
      setData({ status: 'loading', stations: [] });
      setIndex(0);
      try {
        const stations = await fetchStationsByTag(tag);
        if (id === requestRef.current) show(stations);
      } catch {
        if (id === requestRef.current) setData({ status: 'error', stations: [] });
      }
    },
    [show],
  );

  useEffect(() => {
    load(genre);
  }, [genre, load]);

  // Home deep-links here with { station, genre } to centre that record.
  const focus = route.params?.station;
  useEffect(() => {
    if (!focus) return;
    const nextGenre = route.params.genre ?? genre;
    navigation.setParams({ station: undefined, genre: undefined });
    if (nextGenre === genre && data.status === 'ready') {
      const i = data.stations.findIndex((s) => s.id === focus.id);
      if (i >= 0) setIndex(i);
      else {
        setData((d) => ({ ...d, stations: [focus, ...d.stations] }));
        setIndex(0);
      }
      return;
    }
    // Otherwise centre it once the (new) genre finishes loading.
    pendingFocus.current = focus;
    if (nextGenre !== genre) setGenre(nextGenre);
    else if (data.status === 'error') load(genre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const { stations } = data;
  const active = stations[index] ?? null;
  const label = GENRES.find((g) => g.tag === genre)?.label ?? genre;

  // Pull glow colours for the record in focus and its neighbours, so the
  // colour is usually ready before you swipe to it.
  useEffect(() => {
    let alive = true;
    stations.slice(Math.max(0, index - 1), index + 3).forEach((s) => {
      getStationGlow(s).then((c) => alive && setGlows((g) => (s.id in g ? g : { ...g, [s.id]: c })));
    });
    return () => {
      alive = false;
    };
  }, [stations, index]);

  // Track info for the record in focus, polled while this tab is visible.
  const fetchedTrack = useNowPlaying(active, isFocused);

  // Always reserve the mini player's slot so the record never resizes when
  // playback starts.
  const tabBarHeight = useBottomTabBarHeight();
  const bottomPad = tabBarHeight + MINI_PLAYER_SPACE;
  const stage = layout && { width: layout.width, height: layout.height - bottomPad };

  // The record fills ~70% of the width, but never so tall that the name and
  // track line get pushed under the mini player.
  const discSize = stage
    ? Math.round(Math.min(stage.width * 0.7, (stage.height - TEXT_BLOCK) * 0.86, 440))
    : 0;
  const compact = stage ? stage.width < 420 : true;

  const statusFor = (station) => (player.current?.id === station.id ? player.status : null);

  const metaFor = (station) => {
    const where = [station.country, station.bitrate ? `${station.bitrate} kbps` : null].filter(Boolean).join(' · ');
    switch (statusFor(station)) {
      case 'loading':
        return 'Tuning in…';
      case 'playing':
        return where ? `On air · ${where}` : 'On air';
      case 'paused':
        return 'Paused';
      case 'error':
        return 'Stream not responding · Tap to retry';
      default:
        return where || 'Live radio';
    }
  };

  // While it plays, the stream's own titles (native ICY) win over polling.
  const trackFor = (station) =>
    (player.current?.id === station.id && player.trackTitle) || fetchedTrack;
  const itemWidth = carouselItemWidth(discSize);

  let content;
  if (!stage) content = null;
  else if (data.status === 'ready' && stations.length > 0) {
    content = (
      <>
        <View style={{ width: stage.width, height: discSize + 40 }}>
          <GlowField
            items={stations}
            colorsById={glows}
            index={index}
            x={scrollX}
            itemWidth={itemWidth}
            discSize={discSize}
            centerY={(discSize + 40) / 2}
            width={stage.width}
          />
          <RecordCarousel
            key={genre}
            position={scrollX}
            items={stations}
            index={index}
            onIndexChange={setIndex}
            onPressActive={player.toggle}
            width={stage.width}
            height={discSize + 40}
            discSize={discSize}
            renderItem={(station, i) => (
              <Vinyl
                station={station}
                focused={i === index}
                size={discSize}
                status={statusFor(station)}
                spinning={player.current?.id === station.id && player.status === 'playing'}
              />
            )}
          />
        </View>
        <View style={styles.textSlot}>
          {active && (
            <StationText
              station={active}
              track={trackFor(active)}
              status={statusFor(active)}
              meta={metaFor(active)}
              compact={compact}
            />
          )}
        </View>
      </>
    );
  } else {
    const loading = data.status === 'loading';
    content = (
      <>
        <View style={{ height: discSize + 40, justifyContent: 'center' }}>
          <Vinyl station={null} size={discSize} spinning={loading} />
        </View>
        <View style={styles.textSlot}>
          {loading ? (
            <Notice title="Tuning in…" body={`Finding ${label} stations on air`} />
          ) : data.status === 'error' ? (
            <Notice
              title="Couldn't reach the airwaves"
              body="Check your connection and try again."
              action="Retry"
              onAction={() => load(genre)}
            />
          ) : (
            <Notice title={`No ${label} on air`} body="Try another genre." />
          )}
        </View>
      </>
    );
  }

  return (
    <View style={styles.screen}>
      {stage && <FogPlane x={scrollX} width={stage.width} span={itemWidth * stations.length} />}

      <View style={[styles.header, { paddingTop: insets.top + space.lg }]}>
        <Text style={styles.title}>Radio</Text>
        {data.status === 'ready' && stations.length > 0 && (
          <Text style={styles.counter}>
            {String(index + 1).padStart(2, '0')}
            <Text style={{ color: colors.textFaint }}> / {String(stations.length).padStart(2, '0')}</Text>
          </Text>
        )}
      </View>
      <GenrePills selected={genre} onSelect={setGenre} />

      <View
        style={[styles.stage, { paddingBottom: bottomPad }]}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setLayout((l) => (l && l.width === width && l.height === height ? l : { width, height }));
        }}
      >
        {content}
        {data.status === 'ready' && !player.current && stations.length > 0 && (
          <Text style={[styles.hint, { bottom: tabBarHeight + MINI_PLAYER_SPACE / 2 - 6 }]}>Swipe to browse · Tap the record to play</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
  },
  title: { fontFamily: fonts.semibold, color: colors.text, fontSize: 28, letterSpacing: -1 },
  counter: { fontFamily: fonts.mono, color: colors.textMuted, fontSize: 12, letterSpacing: 1.5 },
  pillsScroll: { flexGrow: 0, flexShrink: 0 },
  pills: { paddingHorizontal: space.lg, gap: 2, alignItems: 'center' },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill },
  pillActive: { backgroundColor: 'rgba(255,255,255,0.12)' },
  pillText: { fontFamily: fonts.semibold, color: colors.textFaint, fontSize: 14, letterSpacing: -0.1 },
  pillTextActive: { color: colors.text },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  textSlot: { height: TEXT_BLOCK, alignSelf: 'stretch' },
  textBlock: {
    position: 'absolute',
    top: space.md,
    left: space.xl,
    right: space.xl,
    alignItems: 'center',
    gap: space.sm,
  },
  name: {
    color: colors.text,
    fontSize: 40,
    lineHeight: 44,
    fontFamily: fonts.bold,
    letterSpacing: -1.4,
    textAlign: 'center',
  },
  nameCompact: { fontSize: 30, lineHeight: 34, letterSpacing: -0.9 },
  trackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, maxWidth: '100%' },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  subtitle: { fontFamily: fonts.medium, color: colors.textMuted, fontSize: 15, letterSpacing: -0.1, textAlign: 'center', flexShrink: 1 },
  subtitleLead: { color: colors.textFaint },
  meta: { fontFamily: fonts.mono, color: colors.textFaint, fontSize: 10.5, letterSpacing: 1.8, textTransform: 'uppercase', textAlign: 'center' },
  hint: { position: 'absolute', bottom: MINI_PLAYER_SPACE / 2 - 6, fontFamily: fonts.mono, color: colors.textFaint, fontSize: 10.5, letterSpacing: 2, textTransform: 'uppercase' },
  retry: {
    marginTop: space.sm,
    paddingHorizontal: space.xl,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
  },
  retryText: { fontFamily: fonts.semibold, color: colors.bg },
});
