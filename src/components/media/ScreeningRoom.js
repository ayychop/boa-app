import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import YouTubePlayer from './YouTubePlayer';
import VideoPlayer from './VideoPlayer';
import Poster, { metaLine } from '../Poster';
import { Button, Slate, Viewfinder } from '../ui';
import { colors, fonts, space, type } from '../../theme';

/**
 * Full-screen player. Episodes play from a direct file through <video> when
 * one exists, otherwise from YouTube (where BOA publishes today).
 */
export default function ScreeningRoom({ screening, onClose, onSwitch }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (!screening) return null;

  const { production, kind, episode } = screening;
  const videoWidth = Math.max(Math.min(width, ((height - 260) * 16) / 9, 1200), Math.min(width, 300));
  const videoHeight = Math.round((videoWidth * 9) / 16);

  let source = null;
  if (kind === 'trailer' && production.trailerYouTubeId) source = { youTubeId: production.trailerYouTubeId };
  if (kind === 'episode' && episode) source = episode.videoUrl ? { videoUrl: episode.videoUrl } : { youTubeId: episode.youTubeId };

  const label = kind === 'trailer' ? 'Official trailer' : episode?.title ?? 'Episode';
  const firstEpisode = production.episodes[0];

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(220)} style={styles.backdrop}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl }}>
          <View style={styles.topBar}>
            <Slate dot>Now screening · {label}</Slate>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close player"
              style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          <Animated.View
            entering={FadeInDown.springify().damping(20).stiffness(140)}
            style={[styles.stage, { width: videoWidth, height: videoHeight }]}
          >
            {source?.youTubeId ? (
              <YouTubePlayer key={source.youTubeId} videoId={source.youTubeId} width={videoWidth} height={videoHeight} />
            ) : source?.videoUrl ? (
              <VideoPlayer uri={source.videoUrl} poster={production.image} width={videoWidth} height={videoHeight} />
            ) : (
              <View>
                <Poster production={production} width={videoWidth} showTitle={false} rounded={0} />
                <View style={styles.soonOverlay}>
                  <Viewfinder />
                  <Text style={styles.soonTitle}>
                    {kind === 'trailer' ? 'Trailer' : 'Episode'} <Text style={type.serif}>coming soon</Text>
                  </Text>
                </View>
              </View>
            )}
          </Animated.View>

          <View style={[styles.info, { width: Math.min(width, 760) }]}>
            <Text style={type.h1}>{production.title}</Text>
            {!!metaLine(production) && <Slate style={{ marginTop: 10 }}>{metaLine(production)}</Slate>}
            {production.logline && <Text style={[type.bodyMuted, { marginTop: space.lg }]}>{production.logline}</Text>}
            <View style={styles.actions}>
              {kind === 'episode' && production.trailerYouTubeId && (
                <Button
                  label="Watch Trailer"
                  icon="film-outline"
                  variant="ghost"
                  onPress={() => onSwitch({ production, kind: 'trailer' })}
                />
              )}
              {kind === 'trailer' && firstEpisode && (
                <Button
                  label={`Play ${firstEpisode.title}`}
                  icon="play"
                  onPress={() => onSwitch({ production, kind: 'episode', episode: firstEpisode })}
                />
              )}
            </View>
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(243,239,232,0.1)',
  },
  stage: { alignSelf: 'center', backgroundColor: '#000', overflow: 'hidden' },
  soonOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  soonTitle: { fontFamily: fonts.semibold, fontSize: 26, color: colors.text, letterSpacing: -0.8 },
  info: { alignSelf: 'center', paddingHorizontal: space.xl, paddingTop: space.xl },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.xl },
});
