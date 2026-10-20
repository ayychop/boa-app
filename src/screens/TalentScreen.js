import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { talent } from '../data/boaContent';
import { useForms } from '../context/FormsContext';
import Headshot from '../components/Headshot';
import BottomSheet from '../components/BottomSheet';
import { Button, Fog, Slate, Tappable } from '../components/ui';
import useBottomSpace from '../hooks/useBottomSpace';
import { colors, fonts, radius, space, type } from '../theme';

const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'model', label: 'Model', test: (p) => p.role === 'Model' },
  { id: 'actor', label: 'Actor & Model', test: (p) => p.role !== 'Model' },
];
const GAP = 12;

// Greedy masonry: each card goes into whichever column is currently shortest.
function toColumns(people, count) {
  const cols = Array.from({ length: count }, () => ({ height: 0, items: [] }));
  people.forEach((p) => {
    const col = cols.reduce((a, b) => (b.height < a.height ? b : a));
    col.items.push(p);
    col.height += 1 / p.ratio + 0.28; // + caption
  });
  return cols.map((c) => c.items);
}

function TalentCard({ person, width, onPress, delay }) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).springify().damping(18)} layout={LinearTransition.springify().damping(20)}>
      <Tappable onPress={() => onPress(person)} accessibilityRole="button" accessibilityLabel={`${person.name}, ${person.role}`}>
        <Headshot person={person} width={width} ratio={person.ratio} />
        <View style={styles.caption}>
          <Slate>{person.role}</Slate>
          <Text style={styles.name} numberOfLines={1}>
            {person.name}
          </Text>
        </View>
      </Tappable>
    </Animated.View>
  );
}

export default function TalentScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const bottom = useBottomSpace(space.xxl);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const forms = useForms();

  const open = (person) => {
    setSelected(person);
    setSheetOpen(true);
  };

  // Home's "Our Talent" row deep-links here with a person to open.
  const focusId = route.params?.talentId;
  useEffect(() => {
    if (!focusId) return;
    const person = talent.find((t) => t.id === focusId);
    if (person) open(person);
    navigation.setParams({ talentId: undefined });
  }, [focusId, navigation]);

  const contentWidth = Math.min(width, 1200);
  const columns = contentWidth < 640 ? 2 : contentWidth < 1000 ? 3 : 4;
  const colWidth = Math.floor((contentWidth - space.xl * 2 - GAP * (columns - 1)) / columns);
  const visible = talent.filter(FILTERS.find((f) => f.id === filter).test);
  const grid = toColumns(visible, columns);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottom }} showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.hero,
            { paddingTop: insets.top + space.xxl, paddingHorizontal: (width - contentWidth) / 2 + space.xl },
          ]}
        >
          <Fog opacity={0.22} />
          <LinearGradient colors={['transparent', colors.bg]} locations={[0.5, 1]} style={StyleSheet.absoluteFill} />
          <Slate dot>03 · Talent</Slate>
          <Text style={[type.display, { marginTop: space.md }]}>
            The <Text style={[type.serif, styles.serifBig]}>roster.</Text>
          </Text>
          <Text style={[type.bodyMuted, styles.lede]}>
            Actors and models we believe in. Most of them came through an open call. None of them came through a favour.
          </Text>
          <View style={styles.filters}>
            {FILTERS.map((f) => {
              const active = f.id === filter;
              const count = talent.filter(f.test).length;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => setFilter(f.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [styles.filter, active && styles.filterActive, pressed && { opacity: 0.7 }]}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
                  <Text style={[styles.filterCount, active && { color: colors.bg }]}>{count}</Text>
                </Pressable>
              );
            })}
          </View>
          <Slate style={{ marginTop: space.lg }}>Showing {visible.length} people</Slate>
        </View>

        <View style={[styles.grid, { width: contentWidth, gap: GAP }]}>
          {grid.map((col, c) => (
            <View key={c} style={{ width: colWidth, gap: space.lg }}>
              {col.map((person, i) => (
                <TalentCard
                  key={person.id}
                  person={person}
                  width={colWidth}
                  onPress={open}
                  delay={(i * columns + c) * 55}
                />
              ))}
            </View>
          ))}
        </View>

        <Animated.View entering={FadeIn.delay(300)} style={styles.cta}>
          <Text style={[type.h1, { textAlign: 'center' }]}>
            The next face here could be <Text style={type.serif}>yours.</Text>
          </Text>
          <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: space.sm }]}>
            No agent. No followers. No fee. Send us what you have and a real person will watch it.
          </Text>
          <Button label="Get seen" icon="arrow-forward" onPress={forms.openGetSeen} style={{ marginTop: space.xl }} />
        </Animated.View>
      </ScrollView>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        {selected && (
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Headshot person={selected} width={112} round />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Slate color={selected.tint}>{selected.role}</Slate>
                <Text style={[type.h1, { marginTop: 6 }]} numberOfLines={2}>
                  {selected.name}
                </Text>
                <Slate style={{ marginTop: 8 }}>BOA Network roster</Slate>
              </View>
            </View>
            <View style={styles.sheetActions}>
              <Button label="View Profile" icon="person-outline" onPress={() => Linking.openURL(selected.profileUrl)} style={{ flex: 1 }} />
              <Button
                label="Enquire"
                icon="mail-outline"
                variant="ghost"
                onPress={() => {
                  setSheetOpen(false);
                  forms.openContact({ subject: `Booking enquiry: ${selected.name}` });
                }}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: { paddingHorizontal: space.xl, paddingBottom: space.xl, overflow: 'hidden' },
  serifBig: { fontSize: 50, letterSpacing: -1 },
  lede: { marginTop: space.md, maxWidth: 520 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xl },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  filterActive: { backgroundColor: colors.text, borderColor: colors.text },
  filterText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  filterTextActive: { color: colors.bg },
  filterCount: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint },
  grid: { flexDirection: 'row', alignSelf: 'center', paddingHorizontal: space.xl },
  caption: { paddingTop: 10, gap: 4 },
  name: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text, letterSpacing: -0.3 },
  cta: { alignItems: 'center', paddingHorizontal: space.xl, paddingTop: space.xxxl * 1.5, maxWidth: 620, alignSelf: 'center' },
  sheet: { paddingHorizontal: space.xl, gap: space.xl },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  sheetActions: { flexDirection: 'row', gap: space.md },
});
