import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Text, { TextInput } from '../ScopedText';
import { requireOptionalNativeModule } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '../BottomSheet';
import { LoadingDots } from '../Skeleton';
import { GIF_SHELVES, gifKey, loadGifs } from '../../chat/gifs';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space } from '../../theme';

// Builds made before expo-image was added don't have it; GIFs need it to move.
const Image = requireOptionalNativeModule('ExpoImage') ? require('expo-image').Image : null;

const GRID_H = 380;
const GAP = 6;

/**
 * GIFs from GIPHY: Trending first, a TikTok shelf and a few more along the
 * top, and search. Tap one to send it. Pages in as you scroll.
 */
export default function GifPicker({ open, onPick, onClose }) {
  const { width } = useWindowDimensions();
  const avail = Math.min(width, 600) - space.lg * 2;
  const columns = avail > 480 ? 4 : 3;
  const cell = Math.floor((avail - GAP * (columns - 1)) / columns);

  const [shelf, setShelf] = useState('trending');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | error | nokey
  const [error, setError] = useState('');
  const run = useRef(0);

  // What's being looked for: what's typed, else the shelf's own search.
  const shelfQuery = GIF_SHELVES.find((s) => s.id === shelf)?.query ?? '';
  const effective = query || shelfQuery;

  const fetchPage = useCallback(
    async (offset) => {
      const mine = ++run.current;
      if (!gifKey()) {
        setState('nokey');
        return;
      }
      if (!offset) setState('loading');
      try {
        const page = await loadGifs({ query: effective, offset });
        if (mine !== run.current) return;
        setItems((cur) => (offset ? [...cur, ...page.items.filter((g) => !cur.some((c) => c.id === g.id))] : page.items));
        setNext(page.next);
        setState('ready');
      } catch (err) {
        if (mine !== run.current) return;
        setError(err?.message || "GIFs aren't available right now.");
        setState('error');
      }
    },
    [effective],
  );

  useEffect(() => {
    if (open) fetchPage(0);
    else run.current += 1;
  }, [open, fetchPage]);

  // Typing waits for a breath before it searches.
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 350);
    return () => clearTimeout(t);
  }, [text]);

  const close = () => {
    setText('');
    setQuery('');
    onClose?.();
  };

  const pick = (gif) => {
    haptics.tap();
    onPick(gif);
    close();
  };

  const empty =
    state === 'loading' ? (
      <LoadingDots style={{ alignSelf: 'center', marginTop: space.xl }} testID="gif-loading" />
    ) : state === 'nokey' ? (
      <View style={styles.note} testID="gif-nokey">
        <Ionicons name="images-outline" size={26} color={colors.textFaint} />
        <Text style={styles.noteTitle}>GIFs aren't switched on in this build</Text>
        <Text style={styles.noteText}>This build was made without a GIPHY key, so there's nothing to load yet.</Text>
      </View>
    ) : state === 'error' ? (
      <View style={styles.note} testID="gif-error">
        <Ionicons name="cloud-offline-outline" size={26} color={colors.textFaint} />
        <Text style={styles.noteText}>{error}</Text>
        <Pressable onPress={() => fetchPage(0)} accessibilityRole="button" style={styles.retry} testID="gif-retry">
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    ) : (
      <Text style={styles.empty}>{effective ? `No GIFs for “${effective}”.` : 'Nothing here yet.'}</Text>
    );

  return (
    <BottomSheet open={open} onClose={close} dragAnywhere={false}>
      <View style={styles.body} testID="gif-picker">
        <Text style={styles.title}>GIFs</Text>
        <View style={styles.search}>
          <Ionicons name="search" size={16} color={colors.textFaint} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Search GIPHY"
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search GIFs"
            testID="gif-search"
          />
        </View>
        {!query ? (
          <FlatList
            horizontal
            data={GIF_SHELVES}
            keyExtractor={(s) => s.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.shelves}
            renderItem={({ item: s }) => {
              const on = s.id === shelf;
              return (
                <Pressable
                  onPress={() => {
                    haptics.selection();
                    setShelf(s.id);
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  style={[styles.shelf, on && styles.shelfOn]}
                  testID={`gif-shelf-${s.id}`}
                >
                  <Ionicons name={s.icon} size={14} color={on ? colors.bg : colors.textMuted} />
                  <Text style={[styles.shelfText, on && { color: colors.bg }]}>{s.label}</Text>
                </Pressable>
              );
            }}
          />
        ) : (
          <View style={{ height: space.md }} />
        )}
        <FlatList
          key={`${columns}-${effective}`}
          data={state === 'ready' ? items : []}
          numColumns={columns}
          keyExtractor={(g) => g.id}
          style={{ height: GRID_H }}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{ gap: GAP, paddingBottom: space.md }}
          onEndReachedThreshold={0.6}
          onEndReached={() => next != null && state === 'ready' && fetchPage(next)}
          removeClippedSubviews
          initialNumToRender={columns * 4}
          windowSize={5}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => pick(item)}
              accessibilityRole="button"
              accessibilityLabel={`Send GIF${item.title ? `: ${item.title}` : ''}`}
              style={({ pressed }) => [styles.cell, { width: cell, height: cell }, pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }]}
              testID={`gif-${item.id}`}
            >
              {Image ? <Image source={{ uri: item.preview }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" autoplay recyclingKey={item.id} transition={120} /> : null}
            </Pressable>
          )}
          ListEmptyComponent={empty}
        />
        <Text style={styles.credit}>Powered by GIPHY</Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, flexShrink: 1 },
  title: { fontFamily: fonts.chatBold, fontSize: 18, color: colors.text, marginBottom: space.md },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, height: 40, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontFamily: fonts.chat, fontSize: 14, color: colors.text, paddingVertical: 0 },
  shelves: { gap: 6, paddingVertical: space.md },
  shelf: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.06)' },
  shelfOn: { backgroundColor: colors.gold },
  shelfText: { fontFamily: fonts.chat, fontSize: 12.5, color: colors.textMuted },
  cell: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)' },
  note: { alignItems: 'center', gap: space.sm, marginTop: space.xl, paddingHorizontal: space.lg },
  noteTitle: { fontFamily: fonts.chatBold, fontSize: 14, color: colors.text, textAlign: 'center' },
  noteText: { fontFamily: fonts.chat, fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  retry: { marginTop: space.xs, paddingHorizontal: space.lg, height: 36, borderRadius: radius.pill, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontFamily: fonts.chatBold, fontSize: 13, color: colors.bg },
  empty: { fontFamily: fonts.chat, fontSize: 13, color: colors.textFaint, textAlign: 'center', marginTop: space.xl },
  credit: { fontFamily: fonts.chat, fontSize: 10.5, color: colors.textFaint, textAlign: 'center', marginTop: space.xs },
});
