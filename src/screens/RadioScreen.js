import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchStationsByTag, GENRES } from '../api/radio';
import { describePlayback } from '../audio/status';
import { usePlayer } from '../context/PlayerContext';
import RecordCarousel from '../components/RecordCarousel';
import Vinyl from '../components/Vinyl';
import { stationGradient } from '../components/StationLogo';
import { MINI_PLAYER_SPACE } from '../components/MiniPlayer';
import { colors, fonts, radius, space } from '../theme';

const TEXT_BLOCK = 132;

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

function StationText({ station, subtitle, compact }) {
  return (
    <Animated.View
      key={station.id}
      entering={FadeInDown.springify().damping(18).stiffness(160)}
      exiting={FadeOut.duration(120)}
      style={styles.textBlock}
    >
      <Text
        style={[styles.name, compact && styles.nameCompact]}
        numberOfLines={2}
        accessibilityRole="header"
      >
        {station.name}
      </Text>
      <Text style={styles.subtitle} numberOfLines={1}>
        {subtitle}
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
  const [genre, setGenre] = useState(GENRES[0].tag);
  const [index, setIndex] = useState(0);
  const [data, setData] = useState({ status: 'loading', stations: [] });
  const [layout, setLayout] = useState(null);
  const requestRef = useRef(0);
  // A station to centre once its genre's list has loaded (from Home).
  const pendingFocus = useRef(null);

  const load = useCallback(async (tag) => {
    const id = ++requestRef.current;
    setData({ status: 'loading', stations: [] });
    setIndex(0);
    try {
      const stations = await fetchStationsByTag(tag);
      if (id !== requestRef.current) return;
      const focus = stations.findIndex((s) => s.id === pendingFocus.current);
      pendingFocus.current = null;
      if (focus > 0) setIndex(focus);
      setData({ status: 'ready', stations });
    } catch {
      if (id === requestRef.current) setData({ status: 'error', stations: [] });
    }
  }, []);

  useEffect(() => {
    load(genre);
  }, [genre, load]);

  const focus = route.params?.stationId;
  useEffect(() => {
    if (!focus) return;
    const nextGenre = route.params.genre ?? genre;
    navigation.setParams({ stationId: undefined, genre: undefined });
    if (nextGenre === genre && data.status === 'ready') {
      const i = data.stations.findIndex((s) => s.id === focus);
      if (i >= 0) setIndex(i);
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

  const statusFor = (station) => (player.station?.id === station.id ? player.status : null);

  const subtitleFor = (station) => {
    const live = describePlayback(statusFor(station), player.trackTitle);
    if (live) return live;
    return [station.country, station.bitrate ? `${station.bitrate} kbps` : null].filter(Boolean).join(' · ') || 'Live radio';
  };

  let content;
  if (!stage) content = null;
  else if (data.status === 'ready' && stations.length > 0) {
    content = (
      <>
        <RecordCarousel
          key={genre}
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
              spinning={player.station?.id === station.id && player.status === 'playing'}
            />
          )}
        />
        <View style={styles.textSlot}>
          {active && <StationText station={active} subtitle={subtitleFor(active)} compact={compact} />}
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

  const glow = active ? stationGradient(active)[0] : colors.accent;

  return (
    <View style={styles.screen}>
      {/* Ambient wash tinted by the station in focus, Apple Music style. */}
      <Animated.View
        key={glow}
        entering={FadeIn.duration(700)}
        exiting={FadeOut.duration(700)}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      >
        <LinearGradient
          colors={[`${glow}45`, `${glow}10`, 'transparent']}
          locations={[0, 0.45, 0.85]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

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
        {data.status === 'ready' && !player.station && stations.length > 0 && (
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
  subtitle: { fontFamily: fonts.medium, color: colors.textMuted, fontSize: 15, textAlign: 'center' },
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
