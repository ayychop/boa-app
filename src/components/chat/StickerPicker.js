import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '../BottomSheet';
import Sticker from './Sticker';
import { clearFresh, rememberSticker, useStickerCatalogue } from '../../chat/stickers';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space } from '../../theme';

const TABS = [
  { id: 'recent', label: 'Recent', icon: 'time-outline' },
  { id: 'new', label: 'New', icon: 'sparkles' },
  { id: 'Smileys and emotions', label: 'Faces', icon: 'happy-outline' },
  { id: 'People', label: 'People', icon: 'hand-left-outline' },
  { id: 'Animals and nature', label: 'Nature', icon: 'leaf-outline' },
  { id: 'Food and drink', label: 'Food', icon: 'pizza-outline' },
  { id: 'Activities and events', label: 'Party', icon: 'balloon-outline' },
  { id: 'Travel and places', label: 'Travel', icon: 'airplane-outline' },
  { id: 'Objects', label: 'Objects', icon: 'bulb-outline' },
  { id: 'Symbols', label: 'Symbols', icon: 'heart-outline' },
  { id: 'Flags', label: 'Flags', icon: 'flag-outline' },
];
const CELL = 64;
const GRID_H = 340;

/**
 * Animated emoji, Google's whole moving set: search, Recent, New (what
 * Google has added since you last looked) and every category. purpose
 * 'send' sends one as a sticker; 'react' puts it on a message.
 */
export default function StickerPicker({ open, purpose = 'send', onPick, onClose }) {
  const { icons, fresh, recent } = useStickerCatalogue(open);
  const { width } = useWindowDimensions();
  // The sheet is a 600-wide card when unfolded; cells share its width evenly so the grid isn't left-heavy.
  const avail = Math.min(width, 600) - space.lg * 2;
  const columns = Math.max(4, Math.floor(avail / CELL));
  const cellW = Math.floor(avail / columns);
  const [tab, setTab] = useState(null);
  const [query, setQuery] = useState('');
  const sawFresh = useRef(false);
  const freshSet = useMemo(() => new Set(fresh ?? []), [fresh]);

  // Opens on New when Google has added some, else Recent, else Faces.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setTab(freshSet.size ? 'new' : recent.length ? 'recent' : 'Smileys and emotions');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (tab === 'new') sawFresh.current = true;
  }, [tab]);

  const close = () => {
    if (sawFresh.current) clearFresh();
    sawFresh.current = false;
    onClose();
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^:|:$/g, '');
    if (q) return icons.filter((i) => i.emoji === q || i.tags.some((t) => t.includes(q)));
    if (tab === 'recent') return recent.map((emoji) => icons.find((i) => i.emoji === emoji) ?? { code: emoji, emoji });
    if (tab === 'new') return icons.filter((i) => freshSet.has(i.code));
    return icons.filter((i) => i.category === tab);
  }, [icons, recent, freshSet, tab, query]);

  const tabs = TABS.filter((t) => (t.id === 'new' ? freshSet.size > 0 : t.id === 'recent' ? recent.length > 0 : icons.some((i) => i.category === t.id)));

  const pick = (emoji) => {
    haptics.tap();
    rememberSticker(emoji);
    onPick(emoji);
    close();
  };

  return (
    <BottomSheet open={open} onClose={close} dragAnywhere={false}>
      <View style={styles.body} testID="sticker-picker">
        <View style={styles.head}>
          <Text style={styles.title}>{purpose === 'react' ? 'React with anything' : 'Animated emoji'}</Text>
          {freshSet.size ? (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>{freshSet.size} NEW</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.search}>
          <Ionicons name="search" size={16} color={colors.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search: fire, love, laugh…"
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Search animated emoji"
            testID="sticker-search"
          />
        </View>
        {!query ? (
          <FlatList
            horizontal
            data={tabs}
            keyExtractor={(t) => t.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabs}
            renderItem={({ item: t }) => {
              const on = t.id === tab;
              return (
                <Pressable
                  onPress={() => {
                    haptics.selection();
                    setTab(t.id);
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  style={[styles.tab, on && styles.tabOn]}
                  testID={`sticker-tab-${t.id}`}
                >
                  <Ionicons name={t.icon} size={14} color={on ? colors.bg : t.id === 'new' ? colors.gold : colors.textMuted} />
                  <Text style={[styles.tabText, on && { color: colors.bg }]}>{t.label}</Text>
                </Pressable>
              );
            }}
          />
        ) : null}
        <FlatList
          key={`${columns}-${tab}-${query ? 'q' : ''}`}
          data={shown}
          numColumns={columns}
          keyExtractor={(i) => i.code}
          style={{ height: GRID_H }}
          initialNumToRender={columns * 5}
          windowSize={5}
          removeClippedSubviews
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => pick(item.emoji)}
              accessibilityRole="button"
              accessibilityLabel={`${purpose === 'react' ? 'React' : 'Send'} ${item.tags?.[0]?.replace(/:/g, '') || item.emoji}`}
              style={({ pressed }) => [styles.cell, { width: cellW }, pressed && styles.cellPressed]}
              testID={`sticker-${item.emoji}`}
            >
              <Sticker emoji={item.emoji} size={46} />
              {freshSet.has(item.code) && tab !== 'new' ? <View style={styles.dot} /> : null}
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>{query ? `Nothing for “${query}”.` : 'Nothing here yet.'}</Text>
          }
        />
        <Text style={styles.credit}>Animated emoji by Google (Noto), new ones arrive on their own.</Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, flexShrink: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  title: { fontFamily: fonts.chatBold, fontSize: 18, color: colors.text },
  newBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.gold },
  newBadgeText: { fontFamily: fonts.stamp, fontSize: 10, letterSpacing: 1.2, color: colors.bg },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, height: 40, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontFamily: fonts.chat, fontSize: 14, color: colors.text, paddingVertical: 0 },
  tabs: { gap: 6, paddingVertical: space.md },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.06)' },
  tabOn: { backgroundColor: colors.gold },
  tabText: { fontFamily: fonts.chat, fontSize: 12.5, color: colors.textMuted },
  grid: { paddingBottom: space.md },
  cell: { width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  cellPressed: { backgroundColor: 'rgba(255,255,255,0.08)', transform: [{ scale: 0.9 }] },
  dot: { position: 'absolute', top: 8, right: 10, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.gold },
  empty: { fontFamily: fonts.chat, fontSize: 13, color: colors.textFaint, textAlign: 'center', marginTop: space.xl },
  credit: { fontFamily: fonts.chat, fontSize: 10.5, color: colors.textFaint, textAlign: 'center', marginTop: space.xs },
});
