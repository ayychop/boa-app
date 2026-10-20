import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { usePlaybackProgress, usePlayer } from '../context/PlayerContext';
import { useMedia } from '../context/MediaContext';
import { podcastById } from '../data/podcasts';
import PodcastCover from './PodcastCover';
import { describePlayback } from '../audio/status';
import StationLogo from './StationLogo';
import { colors, fonts, radius, space } from '../theme';

const HEIGHT = 60;
// Space screens should leave free at the bottom so content isn't hidden.
export const MINI_PLAYER_SPACE = HEIGHT + space.md * 2;

// Thin progress line for on-demand audio; isolated so only it re-renders on
// every position tick.
function ProgressLine({ tint }) {
  const { position, duration } = usePlaybackProgress();
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  return (
    <View style={styles.progress}>
      <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: tint }]} />
    </View>
  );
}

export default function MiniPlayer({ onOpenRadio }) {
  const { current, status, trackTitle, isPlaying, toggle } = usePlayer();
  const media = useMedia();
  if (!current) return null;

  const podcast = current.kind === 'podcast' ? podcastById(current.podcastId) : null;
  const subtitle = podcast
    ? `${podcast.title} · Ep ${current.episodeNumber}${status === 'paused' ? ' · Paused' : ''}`
    : describePlayback(status, trackTitle) || 'Live radio';
  const open = () => (podcast ? media.openPodcast(podcast, { autoplay: false }) : onOpenRadio());

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(17).stiffness(170)}
      exiting={FadeOutDown.duration(180)}
      style={styles.wrap}
      pointerEvents="box-none"
    >
      <View style={styles.pill}>
        <BlurView intensity={60} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
        <View style={styles.tint} />
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={`Now playing: ${current.name}. Open player`}
          style={styles.info}
        >
          {podcast ? (
            <PodcastCover podcast={podcast} size={42} rounded={10} />
          ) : (
            <StationLogo station={current} size={42} rounded={21} fit="cover" />
          )}
          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={1}>
              {current.name}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => toggle()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          style={({ pressed }) => [styles.button, pressed && { transform: [{ scale: 0.92 }] }]}
        >
          {status === 'loading' ? (
            <ActivityIndicator color={colors.bg} size="small" />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={20}
              color={colors.bg}
              style={isPlaying ? null : { marginLeft: 2 }}
            />
          )}
        </Pressable>
        {podcast && <ProgressLine tint={podcast.palette[0]} />}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: '100%',
    marginBottom: space.md,
    alignItems: 'center',
  },
  pill: {
    width: '100%',
    maxWidth: 520,
    height: HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: 9,
    paddingRight: 9,
    borderRadius: radius.pill,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    boxShadow: '0px 12px 32px rgba(0,0,0,0.45)',
  },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(30,30,34,0.55)' },
  progress: { position: 'absolute', left: 28, right: 28, bottom: 0, height: 2, backgroundColor: 'rgba(243,239,232,0.12)' },
  progressFill: { height: '100%' },
  info: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.md },
  body: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.bold, color: colors.text, fontSize: 15, letterSpacing: -0.3 },
  subtitle: { fontFamily: fonts.medium, color: colors.textMuted, fontSize: 12.5, marginTop: 1 },
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.text,
  },
});
