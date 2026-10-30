import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Text from '../ScopedText';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { usePlayer } from '../../context/PlayerContext';
import { useMedia } from '../../context/MediaContext';
import { useUser } from '../../context/UserContext';
import { heart, listFavourites, myHearts, unheart } from '../../api/hearts';
import { productions } from '../../data/boaContent';
import StationLogo from '../StationLogo';
import { HeartButton } from '../HeartBurst';
import { Slate } from '../ui';
import { colors, fonts, radius, space } from '../../theme';

const CARD = 136;

/**
 * Someone's favourite stations and BOA Originals (the ones they've
 * hearted). Tap to play or watch; heart one to make it a favourite of
 * yours too (a station is saved to your radio).
 */
export default function Favourites({ userId, myId }) {
  const [items, setItems] = useState([]);
  const [mineOriginals, setMineOriginals] = useState(new Set());
  const { play } = usePlayer();
  const { openEpisode } = useMedia();
  const { isSaved, toggleSaved } = useUser();
  const self = userId === myId;

  useEffect(() => {
    let alive = true;
    listFavourites(userId)
      .then((rows) => {
        if (!alive) return;
        setItems(rows);
        const originals = rows.filter((r) => r.target_kind === 'original').map((r) => r.target_id);
        if (myId && originals.length) myHearts(myId, 'original', originals).then((set) => alive && setMineOriginals(set));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [userId, myId]);

  const shown = items
    .map((f) => (f.target_kind === 'original' ? { ...f, production: productions.find((p) => p.id === f.target_id) } : f))
    .filter((f) => f.target_kind === 'station' ? f.target_meta?.streamUrl : f.production);
  if (!shown.length) return null;

  const toggleOriginal = async (f) => {
    const on = mineOriginals.has(f.target_id);
    setMineOriginals((s) => {
      const n = new Set(s);
      if (on) n.delete(f.target_id);
      else n.add(f.target_id);
      return n;
    });
    try {
      if (on) await unheart(myId, 'original', f.target_id);
      else await heart(myId, 'original', f.target_id, { label: f.production.title });
    } catch (err) {
      Alert.alert("Couldn't save that", err.message);
    }
  };

  return (
    <View testID="profile-favourites">
      <Slate dot color={colors.gold} style={styles.head}>
        Favourites
      </Slate>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {shown.map((f) => {
          const station = f.target_kind === 'station';
          const on = station ? isSaved(f.target_id) : mineOriginals.has(f.target_id);
          return (
            <View key={`${f.target_kind}:${f.target_id}`} style={styles.card} testID={`fav-${f.target_kind}-${f.target_id}`}>
              <Pressable
                onPress={() => (station ? play(f.target_meta) : openEpisode(f.production))}
                accessibilityRole="button"
                accessibilityLabel={`${station ? 'Play' : 'Watch'} ${f.target_label}`}
                style={({ pressed }) => [styles.art, pressed && { opacity: 0.85 }]}
              >
                {station ? (
                  <>
                    <LinearGradient colors={['#1D1710', '#0B0B0D']} style={StyleSheet.absoluteFill} />
                    <StationLogo station={f.target_meta} size={CARD - 40} rounded={14} />
                  </>
                ) : (
                  <Image source={f.production.poster} style={StyleSheet.absoluteFill} resizeMode="cover" />
                )}
                <View style={styles.kind}>
                  <Ionicons name={station ? 'radio' : 'film'} size={11} color="#fff" />
                </View>
                <View style={styles.playBtn}>
                  <Ionicons name="play" size={14} color={colors.bg} />
                </View>
              </Pressable>
              <View style={styles.meta}>
                <Text style={styles.title} numberOfLines={2}>
                  {f.target_label || (station ? 'Station' : 'BOA Original')}
                </Text>
                {!self && myId ? (
                  <HeartButton
                    on={on}
                    size={20}
                    label={`Heart ${f.target_label}`}
                    testID={`fav-heart-${f.target_id}`}
                    onPress={() => (station ? toggleSaved(f.target_meta) : toggleOriginal(f))}
                  />
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: space.lg, marginTop: space.xl, marginBottom: space.md },
  row: { paddingHorizontal: space.lg, gap: space.md },
  card: { width: CARD },
  art: { width: CARD, height: CARD, borderRadius: radius.lg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)' },
  kind: { position: 'absolute', top: 8, left: 8, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,5,6,0.6)' },
  playBtn: { position: 'absolute', right: 8, bottom: 8, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold, boxShadow: '0px 4px 14px rgba(226,168,75,0.5)' },
  meta: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: space.sm },
  title: { flex: 1, fontFamily: fonts.semibold, fontSize: 13, lineHeight: 17, color: colors.text },
});
