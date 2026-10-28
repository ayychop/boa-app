import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useHub } from '../../context/HubContext';
import { getProfile } from '../../api/hub';
import { listHeartsOnMine } from '../../api/hearts';
import { check, need } from '../../api/posts';
import { Avatar, BoaStarBadge, PageHeader } from '../../components/kit';
import { HEART } from '../../components/HeartBurst';
import { Slate } from '../../components/ui';
import { colors, fonts, radius, space, type } from '../../theme';
import { ListSkeleton } from '../../components/Skeleton';

function ago(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d}d` : `${Math.round(d / 7)}w`;
}

/**
 * Hearts on your photos and videos: who, on what, and when. Tap someone to
 * look over their profile; they're never told you did, or that you saw
 * their heart.
 */
export default function HubHeartsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { userId, blocked, seeHearts } = useHub();
  const [rows, setRows] = useState([]);
  const [people, setPeople] = useState({});
  const [postsById, setPosts] = useState({});
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const hearts = (await listHeartsOnMine(userId)).filter((h) => h.liker_id !== userId);
      setRows(hearts);
      setStatus('ready');
      const likers = [...new Set(hearts.map((h) => h.liker_id))];
      const profiles = await Promise.all(likers.map((id) => getProfile(id).catch(() => null)));
      setPeople(Object.fromEntries(profiles.filter(Boolean).map((p) => [p.id, p])));
      const ids = [...new Set(hearts.map((h) => h.target_id))];
      if (ids.length) {
        const found = check(await need().from('posts').select('*').in('id', ids)) ?? [];
        setPosts(Object.fromEntries(found.map((p) => [String(p.id), p])));
      }
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [userId]);

  useEffect(() => {
    load();
    seeHearts?.();
  }, [load, seeHearts]);

  const shown = rows.filter((h) => !blocked.has(h.liker_id));
  return (
    <View style={styles.screen} testID="hub-hearts">
      <PageHeader kicker="Creative Hub" title="Hearts" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: insets.bottom + space.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.gold}
          />
        }
      >
        <Text style={styles.private}>
          <Ionicons name="lock-closed" size={11} color={colors.textFaint} /> Only you see these. Nobody is told when you look at their profile.
        </Text>
        {status === 'loading' ? (
          <ListSkeleton rows={6} avatar={44} style={{ marginTop: space.sm }} />
        ) : status === 'error' ? (
          <Text style={[type.bodyMuted, { textAlign: 'center', marginTop: space.xl }]}>{error}</Text>
        ) : !shown.length ? (
          <View style={styles.empty} testID="hearts-empty">
            <LinearGradient colors={['rgba(255,59,92,0.14)', 'rgba(255,255,255,0.02)']} style={StyleSheet.absoluteFill} />
            <Ionicons name="heart-outline" size={30} color={HEART} />
            <Text style={[type.title, { marginTop: space.md, textAlign: 'center' }]}>No hearts yet</Text>
            <Text style={[type.bodyMuted, { marginTop: space.sm, textAlign: 'center' }]}>When someone hearts a photo or video of yours, they show up here.</Text>
          </View>
        ) : (
          <>
            <Slate style={{ marginTop: space.lg, marginBottom: space.sm }}>Recent</Slate>
            {shown.map((h, i) => {
              const p = people[h.liker_id];
              const post = postsById[h.target_id];
              const name = p ? p.display_name || `@${p.username}` : 'Someone';
              return (
                <Animated.View
                  key={`${h.liker_id}:${h.target_id}`}
                  entering={FadeInDown.delay(Math.min(i, 8) * 40)
                    .springify()
                    .damping(20)}
                >
                  <Pressable
                    onPress={() => navigation.navigate('HubProfile', { id: h.liker_id })}
                    accessibilityRole="button"
                    accessibilityLabel={`${name} loved your ${post?.kind === 'video' ? 'video' : 'photo'}`}
                    style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceRaised }]}
                    testID={`heart-row-${h.liker_id}`}
                  >
                    <View>
                      <Avatar uri={p?.avatar_url} name={name} size={48} ring={!!p?.is_boa_star} />
                      <View style={styles.heartDot}>
                        <Ionicons name="heart" size={11} color="#fff" />
                      </View>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.line} numberOfLines={2}>
                        <Text style={styles.name}>{name}</Text> loved your {post?.kind === 'video' ? 'video' : 'photo'}
                        <Text style={styles.time}>{`  ${ago(h.created_at)}`}</Text>
                      </Text>
                      {p?.is_boa_star ? <BoaStarBadge size={14} style={{ alignSelf: 'flex-start', marginTop: 4 }} /> : null}
                    </View>
                    {post ? (
                      <Pressable onPress={() => navigation.navigate('HubPost', { post })} accessibilityRole="button" accessibilityLabel="Open the post" hitSlop={6}>
                        {post.kind === 'video' ? (
                          <View style={[styles.thumb, styles.thumbVideo]}>
                            <Ionicons name="play" size={16} color={colors.gold} />
                          </View>
                        ) : (
                          <Image source={{ uri: post.media_url }} style={styles.thumb} />
                        )}
                      </Pressable>
                    ) : null}
                  </Pressable>
                </Animated.View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  private: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 18, color: colors.textFaint },
  empty: {
    alignItems: 'center',
    padding: space.xl,
    marginTop: space.xl,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,59,92,0.35)',
    backgroundColor: 'rgba(18,18,22,0.6)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: radius.md },
  heartDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HEART,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  line: { fontFamily: fonts.medium, fontSize: 14.5, lineHeight: 20, color: colors.textMuted },
  name: { fontFamily: fonts.semibold, color: colors.text },
  time: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textFaint },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.surface },
  thumbVideo: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
});
