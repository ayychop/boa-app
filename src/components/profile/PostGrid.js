import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Text from '../ScopedText';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { clock } from '../chat/media';
import { haptics } from '../../utils/haptics';
import { colors, fonts, radius, space } from '../../theme';

export const PROFILE_TABS = [
  { id: 'posts', label: 'Posts', icon: 'grid' },
  { id: 'reels', label: 'Reels', icon: 'play-circle' },
  { id: 'tagged', label: 'Tagged', icon: 'pricetag' },
];

const GAP = 2;
export const COLUMNS = 3;

const tabAlpha = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Posts, Reels, Tagged: icon tabs with a bar that glides to the chosen one, in the vibe's accent (gold by default). */
export function ProfileTabs({ value, onChange, width, accent = colors.gold }) {
  const slot = width / PROFILE_TABS.length;
  const x = useSharedValue(PROFILE_TABS.findIndex((t) => t.id === value) * slot);
  useEffect(() => {
    x.value = withSpring(PROFILE_TABS.findIndex((t) => t.id === value) * slot, { duration: 420, dampingRatio: 0.85 });
  }, [value, slot, x]);
  const bar = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {PROFILE_TABS.map((t) => {
        const on = t.id === value;
        return (
          <Pressable
            hitSlop={8}
            key={t.id}
            onPress={() => {
              haptics.selection();
              onChange(t.id);
            }}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: on }}
            style={styles.tab}
            testID={`profile-tab-${t.id}`}
          >
            <Ionicons name={on ? t.icon : `${t.icon}-outline`} size={20} color={on ? colors.text : colors.textFaint} />
            <Text style={[styles.tabLabel, on && { color: colors.text }]}>{t.label}</Text>
          </Pressable>
        );
      })}
      <Animated.View style={[styles.tabBar, { width: slot }, bar]}>
        <LinearGradient
          colors={[tabAlpha(accent, 0), accent, tabAlpha(accent, 0)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.tabBarLine, { boxShadow: `0px 0px 8px ${tabAlpha(accent, 0.8)}` }]}
        />
      </Animated.View>
    </View>
  );
}

function PostTile({ post, size, onPress, index }) {
  const [failed, setFailed] = useState(false);
  const video = post.kind === 'video';
  return (
    <Animated.View entering={FadeIn.delay(Math.min(index, 11) * 30).duration(260)}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${video ? 'Video' : 'Photo'}${post.caption ? `: ${post.caption.slice(0, 80)}` : ''}`}
        style={({ pressed }) => [{ width: size, height: size }, styles.tile, pressed && { opacity: 0.8 }]}
        testID={`post-tile-${post.id}`}
      >
        {!video && !failed ? (
          <Image source={{ uri: post.media_url }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} />
        ) : (
          // Videos (no still to show) and photos that didn't load: dark glass
          // with the first words of the caption.
          <LinearGradient colors={['#1D1710', '#0B0B0D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.tileFallback]}>
            <Ionicons name={video ? 'play' : 'image-outline'} size={Math.round(size * 0.22)} color="rgba(246,211,138,0.85)" />
            {post.caption ? (
              <Text style={styles.tileCaption} numberOfLines={2}>
                {post.caption}
              </Text>
            ) : null}
          </LinearGradient>
        )}
        {video ? (
          <View style={styles.tileBadge}>
            <Ionicons name="videocam" size={11} color="#fff" />
            {post.media_duration_ms ? <Text style={styles.tileBadgeText}>{clock(post.media_duration_ms)}</Text> : null}
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/** A square grid, three across, edge to edge with hairline gaps (Instagram's). */
export function PostGrid({ posts, width, onOpen }) {
  const size = Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS);
  return (
    <View style={[styles.grid, { width }]} testID="post-grid">
      {posts.map((p, i) => (
        <PostTile key={p.id} post={p} size={size} index={i} onPress={() => onOpen(p)} />
      ))}
    </View>
  );
}

const EMPTY = {
  posts: { icon: 'camera-outline', mine: 'Share your first post', theirs: 'No posts yet', body: 'Stills from the set, the studio, the stage.' },
  reels: { icon: 'film-outline', mine: 'Post your first reel', theirs: 'No reels yet', body: 'Showreels, freestyles, behind the scenes.' },
  tagged: { icon: 'pricetag-outline', mine: 'Nobody has tagged you yet', theirs: 'No tagged posts', body: 'Posts other creatives tag you in show up here.' },
};

export function GridEmpty({ tab, mine, onCreate }) {
  const e = EMPTY[tab];
  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.empty} testID={`profile-empty-${tab}`}>
      <View style={styles.emptyRing}>
        <Ionicons name={e.icon} size={30} color={colors.gold} />
      </View>
      <Text style={styles.emptyTitle}>{mine ? e.mine : e.theirs}</Text>
      <Text style={styles.emptyBody}>{e.body}</Text>
      {mine && tab !== 'tagged' && onCreate ? (
        <Pressable onPress={onCreate} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.emptyAction, pressed && { opacity: 0.7 }]}>
          <Text style={styles.emptyActionText}>{tab === 'reels' ? 'Post a video' : 'New post'}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginTop: space.lg },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 10, minHeight: 52 },
  tabLabel: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.textFaint },
  tabBar: { position: 'absolute', bottom: -1, left: 0, height: 2, alignItems: 'center' },
  tabBarLine: { width: '70%', height: 2, borderRadius: 1, boxShadow: '0px 0px 8px rgba(226,168,75,0.8)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginTop: GAP },
  tile: { overflow: 'hidden', backgroundColor: colors.surface },
  tileFallback: { alignItems: 'center', justifyContent: 'center', padding: space.sm, gap: 6 },
  tileCaption: { fontFamily: fonts.medium, fontSize: 10.5, lineHeight: 14, color: colors.textMuted, textAlign: 'center' },
  tileBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(5,5,6,0.55)',
  },
  tileBadgeText: { fontFamily: fonts.stamp, fontSize: 10, color: '#fff' },
  empty: { alignItems: 'center', paddingVertical: space.xxxl, paddingHorizontal: space.xl },
  emptyRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(226,168,75,0.55)',
    backgroundColor: colors.goldSoft,
    boxShadow: '0px 0px 24px rgba(226,168,75,0.25)',
  },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 19, letterSpacing: -0.5, color: colors.text, marginTop: space.lg, textAlign: 'center' },
  emptyBody: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textMuted, marginTop: 6, textAlign: 'center' },
  emptyAction: { marginTop: space.lg, paddingHorizontal: space.lg, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(226,168,75,0.6)' },
  emptyActionText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.gold },
});
