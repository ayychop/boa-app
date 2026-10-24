import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { fetchStationsByTag, GENRES } from '../api/radio';
import { backupStations, curatedStations } from '../data/radioStations';
import { checkAhead, healList, markAlive, markDead, useDeadStations } from '../api/stationHealth';
import { MAX_RETRIES } from '../audio/engine';
import { glowFor } from '../api/stationColor';
import { usePlayer } from '../context/PlayerContext';
import useNowPlaying from '../hooks/useNowPlaying';
import RecordCarousel, { carouselItemWidth } from '../components/RecordCarousel';
import GlowField, { FogPlane } from '../components/GlowField';
import Vinyl from '../components/Vinyl';
import { useMiniPlayerSpace } from '../components/MiniPlayer';
import useLayout from '../hooks/useLayout';
import ZenButton from '../components/display/ZenButton';
import Reactions from '../components/Reactions';
import { GoldBadge, PulseDot } from '../components/ui';
import { genreForVibes, useUser } from '../context/UserContext';
import { usePremium } from '../context/PremiumContext';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, space } from '../theme';

const TEXT_BLOCK = 150;

// One scrolling row of genres.
function GenrePills({ selected, onSelect, style }) {
  const pills = GENRES.map((g) => {
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
  });
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.pillsScroll, style]}
      contentContainerStyle={styles.pills}
    >
      {pills}
    </ScrollView>
  );
}

// Save-to-library heart. Free listeners hit the paywall; for Premium it fills
// in with a pop.
function SaveHeart({ saved, onPress }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const press = () => {
    scale.value = withSequence(withTiming(0.78, { duration: 80 }), withSpring(1, { duration: 450, dampingRatio: 0.4 }));
    onPress();
  };
  return (
    <Pressable
      onPress={press}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityState={{ selected: saved }}
      accessibilityLabel={saved ? 'Remove from My Library' : 'Save station'}
      style={styles.heart}
    >
      <Animated.View style={style}>
        <Ionicons name={saved ? 'heart' : 'heart-outline'} size={26} color={saved ? colors.gold : colors.textMuted} />
      </Animated.View>
    </Pressable>
  );
}

function StationText({ station, track, status, meta, compact, saved, onSave, hifi }) {
  const onAir = status === 'playing';
  return (
    <Animated.View
      key={station.id}
      entering={FadeInDown.springify().damping(18).stiffness(160)}
      exiting={FadeOut.duration(120)}
      style={styles.textBlock}
    >
      <View style={styles.nameRow}>
        <Text style={[styles.name, compact && styles.nameCompact, { flexShrink: 1 }]} numberOfLines={2} accessibilityRole="header">
          {station.name}
        </Text>
        <SaveHeart saved={saved} onPress={onSave} />
      </View>
      {/* Keyed on the title so a new track crossfades in. */}
      <Animated.View key={track || 'live'} entering={FadeIn.duration(350)} style={styles.trackRow}>
        {track ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            <Text style={styles.subtitleLead}>Now playing: </Text>
            {track}
          </Text>
        ) : (
          <>
            {/* The Vyb dot: gold while waiting, neon green once it's on air. */}
            <PulseDot color={onAir ? colors.live : colors.gold} size={7} />
            <Text style={styles.subtitle}>Live Broadcast</Text>
          </>
        )}
      </Animated.View>
      <View style={styles.metaRow}>
        {hifi && <GoldBadge label="HI-FI" />}
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
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
  const user = useUser();
  const { requirePremium } = usePremium();
  const isFocused = useIsFocused();
  // Carousel position, shared with the parallax layers behind it.
  const scrollX = useSharedValue(0);
  const [glows, setGlows] = useState({});
  // Open on the genre their onboarding vibes point to.
  const [genre, setGenre] = useState(() => genreForVibes(user.vibes) ?? GENRES[0].tag);
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

  // Self-healing list: stations found dead this session are swapped for the
  // genre's backups (never the record on screen, so it can still be retried).
  useDeadStations();
  const [focusedId, setFocusedId] = useState(null);
  const stations = healList(data.stations, curatedStations(genre) ? backupStations(genre) : [], focusedId);

  useEffect(() => {
    const id = stations[index]?.id;
    if (id && id !== focusedId) setFocusedId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, stations]);

  // If a dead record was dropped (no backups left), stay on the same station.
  useEffect(() => {
    if (!focusedId) return;
    const i = stations.findIndex((s) => s.id === focusedId);
    if (i >= 0 && i !== index) setIndex(i);
    else if (i < 0 && index > stations.length - 1) setIndex(Math.max(0, stations.length - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stations.map((s) => s.id).join('|')]);

  // A station that still fails after the engine's retries is dead for this
  // session; one that plays is alive again (e.g. after a manual retry).
  const playingId = player.current?.kind === 'radio' ? player.current.id : null;
  useEffect(() => {
    if (!playingId) return;
    if (player.status === 'error') markDead(playingId);
    if (player.status === 'playing') markAlive(playingId);
  }, [player.status, playingId]);

  // Test the neighbours in the background so dead ones are replaced before
  // the listener swipes into them.
  useEffect(() => {
    if (data.status !== 'ready') return;
    checkAhead([stations[index - 1], stations[index + 1], stations[index + 2]]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, data.status, stations.map((s) => s.id).join('|')]);
  const active = stations[index] ?? null;
  const label = GENRES.find((g) => g.tag === genre)?.label ?? genre;

  // Pull glow colours for the record in focus and its neighbours, so the
  // colour is usually ready before you swipe to it. brandColor wins, then the
  // logo's colour, then a warm gold fallback (see glowFor).
  useEffect(() => {
    let alive = true;
    stations.slice(Math.max(0, index - 1), index + 3).forEach((s) => {
      glowFor(s).then((c) => alive && setGlows((g) => (s.id in g ? g : { ...g, [s.id]: c })));
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
  const miniPlayerSpace = useMiniPlayerSpace();
  const bottomPad = tabBarHeight + miniPlayerSpace;
  const stage = layout && { width: layout.width, height: layout.height - bottomPad };

  // A phone on its side is too short to stack the record over its track
  // info, so they sit side by side: the record on the left, the info on
  // the right. Rotating re-measures the stage and re-sizes everything.
  const { short } = useLayout();
  const landscape = short && !!stage && stage.width > stage.height;
  const recordWidth = stage ? (landscape ? stage.width / 2 : stage.width) : 0;

  // The record fills ~70% of its column, but never so tall that the name
  // and track line get pushed under the mini player, or (on its side) out
  // of the stage.
  const discSize = stage
    ? Math.max(
        0,
        Math.round(
          landscape
            ? Math.min(recordWidth * 0.7, stage.height - 48, 440)
            : Math.min(recordWidth * 0.7, (stage.height - TEXT_BLOCK) * 0.86, 440),
        ),
      )
    : 0;
  const compact = recordWidth < 420;

  const statusFor = (station) => (player.current?.id === station.id ? player.status : null);

  const metaFor = (station) => {
    const where = [station.country, station.bitrate ? `${station.bitrate} kbps` : null].filter(Boolean).join(' · ');
    switch (statusFor(station)) {
      case 'loading':
        if (!player.retry) return 'Tuning in…';
        // A stream that was playing keeps reconnecting past the quick retries.
        return player.retry <= MAX_RETRIES ? `Reconnecting… (${player.retry}/${MAX_RETRIES})` : 'Reconnecting…';
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

  let record;
  let info;
  if (!stage) record = info = null;
  else if (data.status === 'ready' && stations.length > 0) {
    record = (
      <View style={{ width: recordWidth, height: discSize + 40 }}>
        <GlowField
          items={stations}
          colorsById={glows}
          index={index}
          x={scrollX}
          itemWidth={itemWidth}
          discSize={discSize}
          centerY={(discSize + 40) / 2}
          width={recordWidth}
        />
        <RecordCarousel
          key={genre}
          position={scrollX}
          items={stations}
          index={index}
          onIndexChange={setIndex}
          // The records on screen become the queue for next/previous.
          onPressActive={(station) => player.toggle(station, stations)}
          width={recordWidth}
          height={discSize + 40}
          discSize={discSize}
          // On its side, neighbours would slide under the track info.
          peek={!landscape}
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
    );
    info = (
      <View style={styles.textSlot}>
        {active && (
          <StationText
            station={active}
            saved={user.isSaved(active.id)}
            hifi={user.isPremium}
            onSave={() =>
              requirePremium(() => user.toggleSaved(active), 'Upgrade to BOA Premium to save your favourite stations.')
            }
            track={trackFor(active)}
            status={statusFor(active)}
            meta={metaFor(active)}
            compact={compact}
          />
        )}
      </View>
    );
  } else {
    const loading = data.status === 'loading';
    record = (
      <View style={{ height: discSize + 40, justifyContent: 'center' }}>
        <Vinyl station={null} size={discSize} spinning={loading} />
      </View>
    );
    info = (
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
    );
  }

  const pills = <GenrePills selected={genre} onSelect={setGenre} style={short && styles.pillsInline} />;

  return (
    <View style={styles.screen}>
      {stage && <FogPlane x={scrollX} width={stage.width} span={itemWidth * stations.length} />}

      <View
        style={[
          styles.header,
          { paddingTop: insets.top + (short ? space.sm : space.lg) },
          short && styles.headerShort,
        ]}
      >
        <Text style={styles.title}>Radio</Text>
        {/* Short screens keep the genres in the header row. */}
        {short && pills}
        <View style={styles.headerRight}>
          {data.status === 'ready' && stations.length > 0 && (
            <Text style={styles.counter}>
              {String(index + 1).padStart(2, '0')}
              <Text style={{ color: colors.textFaint }}> / {String(stations.length).padStart(2, '0')}</Text>
            </Text>
          )}
          <ZenButton />
        </View>
      </View>
      {!short && pills}

      <View
        style={[styles.stage, { paddingBottom: bottomPad }]}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setLayout((l) => (l && l.width === width && l.height === height ? l : { width, height }));
        }}
      >
        {landscape ? (
          <Animated.View key="landscape" entering={FadeIn.duration(360)} style={styles.landscape}>
            <View style={styles.column}>{record}</View>
            <View style={styles.column}>{info}</View>
          </Animated.View>
        ) : (
          <Animated.View key="full" entering={FadeIn.duration(360)} style={styles.full}>
            {record}
            {info}
          </Animated.View>
        )}
        {isFocused && player.current?.kind === 'radio' && player.status === 'playing' && (
          <Reactions style={[{ right: space.lg }, { bottom: bottomPad - space.xs }]} />
        )}
        {data.status === 'ready' && !player.current && stations.length > 0 && (
          <Text
            style={[
              styles.hint,
              { bottom: tabBarHeight + miniPlayerSpace / 2 - 6 },
              // Under the record, not across the track info.
              landscape && { left: 0, width: recordWidth, textAlign: 'center' },
            ]}
          >
            Swipe to browse · Tap the record to play</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
  },
  headerShort: { paddingBottom: space.xs },
  title: { fontFamily: fonts.semibold, color: colors.text, fontSize: 28, letterSpacing: -1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  counter: { fontFamily: fonts.mono, color: colors.textMuted, fontSize: 12, letterSpacing: 1.5 },
  pillsScroll: { flexGrow: 0, flexShrink: 0 },
  pills: { paddingHorizontal: space.lg, gap: 2, alignItems: 'center' },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill },
  pillActive: { backgroundColor: 'rgba(255,255,255,0.12)' },
  pillText: { fontFamily: fonts.semibold, color: colors.textFaint, fontSize: 14, letterSpacing: -0.1 },
  pillTextActive: { color: colors.text },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pillsInline: { flexGrow: 1, flexShrink: 1, flexBasis: 0, marginHorizontal: space.md },
  // Two equal halves: the record and its track info side by side.
  landscape: { flex: 1, flexDirection: 'row', alignSelf: 'stretch' },
  column: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  full: { alignItems: 'center' },
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
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, maxWidth: '100%' },
  heart: { padding: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  trackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, maxWidth: '100%' },
  subtitle: { fontFamily: fonts.medium, color: colors.textMuted, fontSize: 15, letterSpacing: -0.1, textAlign: 'center', flexShrink: 1 },
  subtitleLead: { color: colors.textFaint },
  meta: { fontFamily: fonts.mono, color: colors.textFaint, fontSize: 10.5, letterSpacing: 1.8, textTransform: 'uppercase', textAlign: 'center' },
  hint: { position: 'absolute', fontFamily: fonts.mono, color: colors.textFaint, fontSize: 10.5, letterSpacing: 2, textTransform: 'uppercase' },
  retry: {
    marginTop: space.sm,
    paddingHorizontal: space.xl,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
  },
  retryText: { fontFamily: fonts.semibold, color: colors.bg },
});
