import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePlaybackProgress, usePlayer } from '../context/PlayerContext';
import { useMedia } from '../context/MediaContext';
import { podcastById } from '../data/podcasts';
import PodcastCover from './PodcastCover';
import { describePlayback } from '../audio/status';
import useNowPlaying from '../hooks/useNowPlaying';
import { useUser } from '../context/UserContext';
import { GoldBadge } from './ui';
import StationLogo from './StationLogo';
import { SleepButton } from './SleepTimerMenu';
import { useSleepRemaining } from '../context/SleepTimerContext';
import useLayout from '../hooks/useLayout';
import { colors, fonts, radius, space } from '../theme';

const HEIGHT = 60;
// Landscape phones get a slimmer pill with tighter margins.
const COMPACT_HEIGHT = 46;

function useMetrics() {
  const { short } = useLayout();
  return short
    ? { height: COMPACT_HEIGHT, margin: space.sm, art: 34, button: 34 }
    : { height: HEIGHT, margin: space.md, art: 42, button: 42 };
}

// Space screens should leave free at the bottom so content isn't hidden.
export function useMiniPlayerSpace() {
  const { height, margin } = useMetrics();
  return height + margin * 2;
}

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
  const { current, status, trackTitle, isPlaying, toggle, retry } = usePlayer();
  const media = useMedia();
  const reduceMotion = useReducedMotion();
  const { isPremium } = useUser();
  const nowPlaying = useNowPlaying(current, current?.kind === 'radio');
  const m = useMetrics();
  const sleepLeft = useSleepRemaining();
  const swell = useSharedValue(1);
  const halo = useSharedValue(0);

  // Dynamic Island moment: when audio actually starts, the pill swells on an
  // under-damped spring and a gold halo breathes once. The halo is a
  // pre-shadowed layer whose opacity animates; the shadow itself never does.
  const started = status === 'playing';
  useEffect(() => {
    if (!started) return;
    halo.value = withSequence(withTiming(1, { duration: 160 }), withTiming(0, { duration: 900 }));
    if (reduceMotion) return;
    swell.value = withSequence(
      withSpring(1.045, { duration: 220, dampingRatio: 0.7 }),
      withSpring(1, { duration: 600, dampingRatio: 0.5 }),
    );
  }, [started, current?.id, reduceMotion, swell, halo]);

  const swellStyle = useAnimatedStyle(() => ({ transform: [{ scale: swell.value }] }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: halo.value }));

  if (!current) return null;

  const podcast = current.kind === 'podcast' ? podcastById(current.podcastId) : null;
  const baseSubtitle = podcast
    ? `${podcast.title}${status === 'paused' ? ' · Paused' : ''}`
    : describePlayback(status, trackTitle || nowPlaying, retry) || 'Live radio';
  const subtitle = sleepLeft ? `Sleep in ${Math.ceil(sleepLeft / 60000)} min · ${baseSubtitle}` : baseSubtitle;
  const open = () => (podcast ? media.openPodcast(podcast, { autoplay: false }) : onOpenRadio());

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(17).stiffness(170)}
      exiting={FadeOutDown.duration(180)}
      style={[styles.wrap, { marginBottom: m.margin }]}
      pointerEvents="box-none"
    >
      <Animated.View style={[styles.shell, swellStyle]}>
        <Animated.View pointerEvents="none" style={[styles.halo, haloStyle]} />
        <View style={[styles.pill, { height: m.height }]}>
          {/* Frosted glass: heavy blur, a faint tint, a top sheen, a hairline. */}
          <BlurView intensity={100} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
          <View style={styles.tint} />
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0)']}
            locations={[0, 0.45, 1]}
            style={styles.sheen}
          />
          <Pressable
            onPress={open}
            accessibilityRole="button"
            accessibilityLabel={`Now playing: ${current.name}. Open player`}
            style={styles.info}
          >
            {podcast ? (
              <PodcastCover podcast={podcast} size={m.art} rounded={10} />
            ) : (
              <StationLogo station={current} size={m.art} rounded={m.art / 2} fit="cover" />
            )}
            <View style={styles.body}>
              <View style={styles.titleRow}>
                <Text style={[styles.title, { flexShrink: 1 }]} numberOfLines={1}>
                  {current.name}
                </Text>
                {isPremium && <GoldBadge label="HI-FI" />}
              </View>
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
          </Pressable>
          <SleepButton size={m.button - 6} />
          <Pressable
            onPress={() => toggle()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
            style={({ pressed }) => [
              styles.button,
              { width: m.button, height: m.button, borderRadius: m.button / 2 },
              pressed && { transform: [{ scale: 0.92 }] },
            ]}
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: '100%',
    alignItems: 'center',
  },
  // Shadow lives on an unclipped shell; the glass inside clips its blur.
  shell: {
    width: '100%',
    maxWidth: 520,
    borderRadius: radius.pill,
    boxShadow: '0px 22px 44px rgba(0,0,0,0.6), 0px 6px 14px rgba(0,0,0,0.4)',
  },
  halo: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.pill,
    boxShadow: '0px 0px 0px 1px rgba(226,168,75,0.55), 0px 0px 28px rgba(226,168,75,0.45)',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: 9,
    paddingRight: 9,
    borderRadius: radius.pill,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  tint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(18,18,22,0.32)' },
  sheen: { position: 'absolute', left: 0, right: 0, top: 0, height: '60%' },
  progress: { position: 'absolute', left: 28, right: 28, bottom: 0, height: 2, backgroundColor: 'rgba(243,239,232,0.12)' },
  progressFill: { height: '100%' },
  info: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.md },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontFamily: fonts.bold, color: colors.text, fontSize: 15, letterSpacing: -0.3 },
  subtitle: { fontFamily: fonts.medium, color: colors.textMuted, fontSize: 12.5, marginTop: 1 },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.text,
  },
});
