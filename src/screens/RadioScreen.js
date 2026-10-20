import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { fetchStationsByTag, GENRES } from '../api/radio';
import { usePlayer } from '../context/PlayerContext';
import StationCard from '../components/StationCard';
import { colors, radius, space, type } from '../theme';

function GenreChips({ selected, onSelect }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
    >
      {GENRES.map((g) => {
        const active = g.tag === selected;
        return (
          <Pressable
            key={g.tag}
            onPress={() => onSelect(g.tag)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.75 }]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{g.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SkeletonList() {
  return (
    <View style={styles.skeletonWrap}>
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={styles.skeletonCard}>
          <View style={styles.skeletonLogo} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[styles.skeletonLine, { width: '60%' }]} />
            <View style={[styles.skeletonLine, { width: '35%', height: 8 }]} />
          </View>
        </View>
      ))}
      <View style={styles.checking}>
        <ActivityIndicator color={colors.textMuted} size="small" />
        <Text style={type.caption}>Finding stations with live track info…</Text>
      </View>
    </View>
  );
}

function Message({ icon, title, body, action, onAction }) {
  return (
    <View style={styles.message}>
      <Ionicons name={icon} size={36} color={colors.textFaint} />
      <Text style={type.title}>{title}</Text>
      <Text style={[type.caption, styles.messageBody]}>{body}</Text>
      {action && (
        <Pressable onPress={onAction} style={({ pressed }) => [styles.retry, pressed && { opacity: 0.8 }]}>
          <Text style={styles.retryText}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function RadioScreen() {
  const insets = useSafeAreaInsets();
  const { station: current, play } = usePlayer();
  const [genre, setGenre] = useState(GENRES[0].tag);
  const [state, setState] = useState({ status: 'loading', stations: [], error: null });
  const requestRef = useRef(0);

  const load = useCallback(async (tag) => {
    const id = ++requestRef.current;
    setState({ status: 'loading', stations: [], error: null });
    try {
      const stations = await fetchStationsByTag(tag);
      if (id === requestRef.current) setState({ status: 'ready', stations, error: null });
    } catch (error) {
      if (id === requestRef.current) setState({ status: 'error', stations: [], error });
    }
  }, []);

  useEffect(() => {
    load(genre);
  }, [genre, load]);

  const label = GENRES.find((g) => g.tag === genre)?.label ?? genre;

  const header = (
    <View>
      <LinearGradient
        colors={['rgba(229,9,20,0.38)', 'rgba(229,9,20,0.08)', colors.bg]}
        locations={[0, 0.55, 1]}
        style={[styles.hero, { paddingTop: insets.top + space.xl }]}
      >
        <Text style={type.overline}>BOA Network</Text>
        <Text style={type.display}>Radio</Text>
        <Text style={[type.caption, { marginTop: space.xs }]}>
          Live stations from around the world, with what's playing right now.
        </Text>
      </LinearGradient>
      <GenreChips selected={genre} onSelect={setGenre} />
      {state.status === 'ready' && state.stations.length > 0 && (
        <View style={styles.sectionHead}>
          <Text style={type.title}>{label}</Text>
          <Text style={type.caption}>{state.stations.length} stations</Text>
        </View>
      )}
    </View>
  );

  let body = null;
  if (state.status === 'loading') body = <SkeletonList />;
  else if (state.status === 'error')
    body = (
      <Message
        icon="cloud-offline-outline"
        title="Couldn't load stations"
        body="Check your connection and try again."
        action="Retry"
        onAction={() => load(genre)}
      />
    );
  else if (state.stations.length === 0)
    body = (
      <Message
        icon="radio-outline"
        title={`No ${label} stations right now`}
        body="None of the stations we found are broadcasting track info. Try another genre."
      />
    );

  return (
    <View style={styles.screen}>
      <FlatList
        data={body ? [] : state.stations}
        keyExtractor={(s) => s.id}
        ListHeaderComponent={header}
        ListEmptyComponent={body}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <StationCard station={item} active={current?.id === item.id} onPress={play} />
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { paddingBottom: space.xl },
  row: { paddingHorizontal: space.lg },
  hero: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  chips: { paddingHorizontal: space.lg, gap: space.sm, paddingBottom: space.lg },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.bg },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },
  skeletonWrap: { paddingHorizontal: space.lg, gap: space.sm },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  skeletonLogo: { width: 56, height: 56, borderRadius: 10, backgroundColor: colors.surfaceRaised },
  skeletonLine: { height: 12, borderRadius: 6, backgroundColor: colors.surfaceRaised },
  checking: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingTop: space.md },
  message: { alignItems: 'center', gap: space.sm, paddingHorizontal: space.xxl, paddingTop: space.xxl },
  messageBody: { textAlign: 'center', maxWidth: 280 },
  retry: {
    marginTop: space.sm,
    paddingHorizontal: space.xl,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
  },
  retryText: { color: colors.bg, fontWeight: '700' },
});
