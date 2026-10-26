import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useHub } from '../../context/HubContext';
import { getProfile } from '../../api/hub';
import { deletePost } from '../../api/posts';
import { heart, myHearts, unheart } from '../../api/hearts';
import { HeartBurst, HeartButton } from '../../components/HeartBurst';
import { haptics } from '../../utils/haptics';
import { Avatar, BoaStarBadge, IconButton, PageHeader } from '../../components/kit';
import { colors, fonts, space } from '../../theme';

function PostVideo({ uri }) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls allowsFullscreen />;
}

const when = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** One post, full width: the photo or video, who posted it, the caption and who's tagged. */
export default function HubPostScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { userId } = useHub();
  const post = route.params?.post;
  const [author, setAuthor] = useState(null);
  const [tagged, setTagged] = useState([]);
  const mine = post?.author_id === userId;
  const [loved, setLoved] = useState(false);
  const burst = useRef(null);
  const lastTap = useRef(0);

  useEffect(() => {
    if (!post || mine) return;
    myHearts(userId, 'post', [post.id]).then((set) => setLoved(set.has(String(post.id)))).catch(() => {});
  }, [post, mine, userId]);

  // Hearts are private: the owner is told, nobody sees a count.
  const toggleHeart = async (next = !loved) => {
    if (mine) return;
    setLoved(next);
    try {
      if (next) await heart(userId, 'post', post.id);
      else await unheart(userId, 'post', post.id);
    } catch (err) {
      setLoved(!next);
      Alert.alert("Couldn't heart that", err.message);
    }
  };
  const doubleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      if (mine) return;
      burst.current?.play();
      haptics.success();
      if (!loved) toggleHeart(true);
    } else lastTap.current = now;
  };
  const width = Math.min(window.width, 720);
  const ratio = post?.media_width && post?.media_height ? Math.min(1.6, Math.max(0.56, post.media_height / post.media_width)) : 1;

  useEffect(() => {
    if (!post) return undefined;
    let alive = true;
    getProfile(post.author_id).then((p) => alive && setAuthor(p)).catch(() => {});
    Promise.all((post.tagged ?? []).map((id) => getProfile(id).catch(() => null))).then((rows) => alive && setTagged(rows.filter(Boolean)));
    return () => {
      alive = false;
    };
  }, [post]);

  if (!post) return null;

  const remove = () =>
    Alert.alert('Delete this post?', 'It goes from your profile and from anyone you tagged.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deletePost(post)
            .then(() => navigation.goBack())
            .catch((e) => Alert.alert("Couldn't delete", e.message)),
      },
    ]);

  const name = author ? author.display_name || `@${author.username}` : '';
  return (
    <View style={styles.screen} testID="hub-post">
      <PageHeader
        kicker={post.kind === 'video' ? 'Reel' : 'Post'}
        title={name || 'Post'}
        onBack={() => navigation.goBack()}
        right={mine ? <IconButton icon="trash-outline" label="Delete post" onPress={remove} testID="post-delete" /> : undefined}
      />
      <ScrollView contentContainerStyle={{ alignItems: 'center', paddingBottom: insets.bottom + space.xxl }}>
        <View style={{ width, height: width * ratio, backgroundColor: '#000' }}>
          {post.kind === 'video' ? (
            <PostVideo uri={post.media_url} />
          ) : (
            <Pressable onPress={doubleTap} style={StyleSheet.absoluteFill} accessibilityLabel="Photo. Double tap to heart" testID="post-media">
              <Image source={{ uri: post.media_url }} style={StyleSheet.absoluteFill} resizeMode="contain" />
            </Pressable>
          )}
          <HeartBurst ref={burst} />
        </View>
        {!mine ? (
          <View style={[styles.bar, { width }]}>
            <HeartButton on={loved} onPress={() => (loved ? toggleHeart(false) : (burst.current?.play(), toggleHeart(true)))} label="Heart" testID="post-heart" />
            <Text style={styles.barHint} numberOfLines={1}>
              {loved ? 'Only they know you hearted this' : post.kind === 'video' ? 'Tap the heart to show some love' : 'Double tap to heart'}
            </Text>
          </View>
        ) : null}
        <View style={[styles.body, { width }]}>
          {author ? (
            <Pressable onPress={() => navigation.push('HubProfile', { id: author.id })} accessibilityRole="button" style={styles.author}>
              <Avatar uri={author.avatar_url} name={name} size={36} ring={!!author.is_boa_star} />
              <Text style={styles.authorName} numberOfLines={1}>
                {name}
              </Text>
              {author.is_boa_star ? <BoaStarBadge size={16} /> : null}
            </Pressable>
          ) : null}
          {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
          {tagged.length ? (
            <View style={styles.tags}>
              {tagged.map((t) => (
                <Pressable key={t.id} onPress={() => navigation.push('HubProfile', { id: t.id })} accessibilityRole="button" style={styles.tag}>
                  <Text style={styles.tagText}>@{t.username}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text style={styles.date}>{when(post.created_at)}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: space.lg, paddingTop: space.lg },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md },
  barHint: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textFaint, flexShrink: 1 },
  author: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  authorName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text, flexShrink: 1 },
  caption: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: colors.text, marginTop: space.md },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.goldSoft },
  tagText: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.gold },
  date: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.textFaint, marginTop: space.lg },
});
