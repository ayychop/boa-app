import { useEffect } from 'react';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, FadeOut, FadeOutDown, FadeOutUp, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import useReducedMotion from '../hooks/useReducedMotion';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePlaybackProgress, usePlayer } from '../context/PlayerContext';
import { useMedia } from '../context/MediaContext';
import { podcastById } from '../data/podcasts';
import PodcastCover from './PodcastCover';
import { describePlayback } from '../audio/status';
import useNowPlaying from '../hooks/useNowPlaying';
import StationLogo from './StationLogo';
import { SleepButton } from './SleepTimerMenu';
import { useSleepRemaining } from '../context/SleepTimerContext';
import useLayout from '../hooks/useLayout';
import useActiveAudio from '../hooks/useActiveAudio';
import { dismissMini, restoreMini, useMiniDismissed } from '../audio/miniDismiss';
import * as ambient from '../audio/ambient';
import { categoryOf, soundscapeById } from '../data/sleep';
import { haptics } from '../utils/haptics';
import { useZen } from '../context/ZenContext';
import { colors, fonts, radius, space } from '../theme';
import { LoadingDots } from './Skeleton';

const HEIGHT = 60;
// Landscape phones get a slimmer pill with tighter margins.
const COMPACT_HEIGHT = 46;

function useMetrics() {
  const { short } = useLayout();
  return short ? { height: COMPACT_HEIGHT, margin: space.sm, art: 34, button: 34 } : { height: HEIGHT, margin: space.md, art: 42, button: 42 };
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

/** Whether the mini player has anything to show (radio, podcast or Zen) and hasn't been swiped away. */
export function useMiniPlayerShown() {
  const dismissed = useMiniDismissed();
  return useActiveAudio().kind != null && !dismissed;
}

// Swipe it away: a flick or a drag of this much, and the bar goes. Short of
// that it springs back.
const DISMISS_DISTANCE = 36;
const DISMISS_VELOCITY = 650;

/**
 * Makes a pill swipe-to-dismiss. Dragging follows the finger (never against the
 * way the bar docks: a bar at the bottom only goes down, one at the top
 * only goes up, and on Home also down); letting go past the threshold slides
 * it out and hides it. The audio is never touched. Taps still reach the
 * buttons inside: the pan only claims a mostly vertical drag.
 */
function useSwipeAway(placement) {
  const y = useSharedValue(0);
  const top = placement === 'top';
  const pan = usePanGesture({
    // Mostly vertical only, so a horizontal slide or a plain tap isn't taken.
    activeOffsetY: [-10, 10],
    failOffsetX: [-24, 24],
    onUpdate: (e) => {
      'worklet';
      // The bar follows the finger towards the way it leaves, and gives a little the other way.
      const away = top ? Math.min(e.translationY, 24) : Math.max(e.translationY, -24);
      y.value = away < 0 && !top ? away * 0.2 : away;
    },
    onDeactivate: (e) => {
      'worklet';
      const down = e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY;
      const up = e.translationY < -DISMISS_DISTANCE || e.velocityY < -DISMISS_VELOCITY;
      if (down || (top && up)) {
        y.value = withTiming(top && up ? -140 : 140, { duration: 160 }, (finished) => {
          'worklet';
          if (finished) scheduleOnRN(dismissMini);
        });
      } else {
        y.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    },
  });
  // Brought back (or a new one shown): it starts in place.
  const dismissed = useMiniDismissed();
  useEffect(() => {
    if (!dismissed) y.value = 0;
  }, [dismissed, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: 1 - Math.min(0.6, Math.abs(y.value) / 160) }));
  return { pan, style };
}

/**
 * The small floating music icon that stands in for a swiped-away bar. Tap it
 * and the bar is back. Only there while something is playing and the bar is
 * hidden; sits where the bar would, on the right, above the tab bar.
 */
export function MiniPlayerFab() {
  const dismissed = useMiniDismissed();
  const { kind } = useActiveAudio();
  const m = useMetrics();
  if (!dismissed || kind == null) return null;
  return (
    <Animated.View style={[styles.fabWrap, { marginBottom: m.margin }]} pointerEvents="box-none">
      <Pressable
        onPress={() => {
          haptics.selection();
          restoreMini();
        }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Show the player"
        testID="mini-player-fab"
        style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.92 }] }]}
      >
        <Ionicons name="musical-notes" size={20} color={colors.bg} />
      </Pressable>
    </Animated.View>
  );
}

// The pill's frosted glass and hairline, shared by both kinds of pill.
function Glass() {
  return (
    <>
      <BlurView intensity={100} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
      <View style={styles.tint} />
      <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0)']} locations={[0, 0.45, 1]} style={styles.sheen} />
    </>
  );
}

/**
 * The pill for a Zen soundscape: its kind ("Rain"), the sound and whether
 * it's paused, and its own play/pause. Tapping it opens Zen.
 */
function ZenPill({ zen, placement, maxWidth }) {
  const m = useMetrics();
  const { openZen } = useZen();
  const sound = soundscapeById(zen.id);
  const kind = categoryOf(zen.id);
  const swipe = useSwipeAway(placement);
  if (!sound || !kind) return null;
  const playing = zen.status === 'playing' || zen.status === 'loading';
  const toggle = () => {
    haptics.tap();
    if (playing) ambient.pause();
    else ambient.play(zen.id);
  };
  return (
    <Animated.View
      entering={(placement === 'top' ? FadeInUp : FadeInDown).springify().damping(17).stiffness(170)}
      exiting={(placement === 'top' ? FadeOutUp : FadeOutDown).duration(180)}
      style={placement === 'top' ? styles.wrapTop : [styles.wrap, { marginBottom: m.margin }]}
      pointerEvents="box-none"
      testID="mini-player-zen"
    >
      <GestureDetector gesture={swipe.pan}>
      <Animated.View style={[styles.shell, maxWidth && { maxWidth }, swipe.style]} testID="mini-player-swipe">
        <View style={[styles.pill, { height: m.height }]}>
          <Glass />
          <Pressable onPress={() => openZen()} accessibilityRole="button" accessibilityLabel={`Now playing: ${kind.label}, ${sound.label}. Open Zen`} style={styles.info}>
            <View style={[styles.zenIcon, { width: m.art, height: m.art, borderRadius: m.art / 2, backgroundColor: kind.tone }]}>
              <Ionicons name={kind.icon.replace('-outline', '')} size={Math.round(m.art * 0.48)} color="#FFFFFF" />
            </View>
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={1}>
                {kind.label}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {`${sound.label} · ${playing ? 'Zen' : 'Paused'}`}
              </Text>
            </View>
          </Pressable>
          <SleepButton size={m.button - 6} />
          <Pressable
            onPress={toggle}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={playing ? `Pause ${kind.label}` : `Play ${kind.label}`}
            testID="mini-player-zen-toggle"
            style={({ pressed }) => [styles.button, { width: m.button, height: m.button, borderRadius: m.button / 2 }, pressed && { transform: [{ scale: 0.92 }] }]}
          >
            {zen.status === 'loading' ? (
              <LoadingDots color={colors.bg} size={4} />
            ) : (
              <Ionicons name={playing ? 'pause' : 'play'} size={20} color={colors.bg} style={playing ? null : { marginLeft: 2 }} />
            )}
          </Pressable>
        </View>
      </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

/**
 * The floating now-playing pill, for whatever the app is on: the radio or a
 * podcast, or a Zen soundscape (useActiveAudio), never a paused station
 * while Zen plays. `placement="bottom"` (the default) rides on top of the
 * tab bar; `placement="top"` docks at the top of its container, as on Home,
 * sliding in from above.
 */
export default function MiniPlayer(props) {
  const { kind, zen } = useActiveAudio();
  const dismissed = useMiniDismissed();
  // Swiped away: only the small music icon remains (MiniPlayerFab). The audio plays on.
  if (dismissed) return null;
  if (kind === 'zen') return <ZenPill zen={zen} placement={props.placement ?? 'bottom'} maxWidth={props.maxWidth} />;
  if (kind === 'radio') return <RadioPill {...props} />;
  return null;
}

function RadioPill({ onOpenRadio, placement = 'bottom', maxWidth }) {
  const { current, status, trackTitle, isPlaying, toggle, retry } = usePlayer();
  const media = useMedia();
  const reduceMotion = useReducedMotion();
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
    swell.value = withSequence(withSpring(1.045, { duration: 220, dampingRatio: 0.7 }), withSpring(1, { duration: 600, dampingRatio: 0.5 }));
  }, [started, current?.id, reduceMotion, swell, halo]);

  const swipe = useSwipeAway(placement);
  const swellStyle = useAnimatedStyle(() => ({ transform: [{ scale: swell.value }] }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: halo.value }));

  if (!current) return null;

  const podcast = current.kind === 'podcast' ? podcastById(current.podcastId) : null;
  const baseSubtitle = podcast ? `${podcast.title}${status === 'paused' ? ' · Paused' : ''}` : describePlayback(status, trackTitle || nowPlaying, retry) || 'Live radio';
  const subtitle = sleepLeft ? `Sleep in ${Math.ceil(sleepLeft / 60000)} min · ${baseSubtitle}` : baseSubtitle;
  const open = () => (podcast ? media.openPodcast(podcast, { autoplay: false }) : onOpenRadio());

  return (
    <Animated.View
      entering={(placement === 'top' ? FadeInUp : FadeInDown).springify().damping(17).stiffness(170)}
      exiting={(placement === 'top' ? FadeOutUp : FadeOutDown).duration(180)}
      style={placement === 'top' ? styles.wrapTop : [styles.wrap, { marginBottom: m.margin }]}
      pointerEvents="box-none"
    >
      <GestureDetector gesture={swipe.pan}>
      <Animated.View style={[styles.shell, maxWidth && { maxWidth }, swipe.style, swellStyle]} testID="mini-player-swipe">
        <Animated.View pointerEvents="none" style={[styles.halo, haloStyle]} />
        <View style={[styles.pill, { height: m.height }]}>
          {/* Frosted glass: heavy blur, a faint tint, a top sheen, a hairline. */}
          <Glass />
          <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`Now playing: ${current.name}. Open player`} style={styles.info}>
            {podcast ? <PodcastCover podcast={podcast} size={m.art} rounded={10} /> : <StationLogo station={current} size={m.art} rounded={m.art / 2} fit="cover" />}
            <View style={styles.body}>
              <View style={styles.titleRow}>
                <Text style={[styles.title, { flexShrink: 1 }]} numberOfLines={1}>
                  {current.name}
                </Text>
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
            style={({ pressed }) => [styles.button, { width: m.button, height: m.button, borderRadius: m.button / 2 }, pressed && { transform: [{ scale: 0.92 }] }]}
          >
            {status === 'loading' ? (
              <LoadingDots color={colors.bg} size={4} />
            ) : (
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color={colors.bg} style={isPlaying ? null : { marginLeft: 2 }} />
            )}
          </Pressable>
          {podcast && <ProgressLine tint={podcast.palette[0]} />}
        </View>
      </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const FAB = 46;

const styles = StyleSheet.create({
  // The music icon that brings a swiped-away bar back: bottom right, above the tab bar.
  fabWrap: { position: 'absolute', right: space.md, bottom: '100%', alignItems: 'flex-end' },
  fab: {
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold,
    boxShadow: '0px 10px 24px rgba(0,0,0,0.5), 0px 0px 0px 1px rgba(255,255,255,0.18)',
  },
  wrap: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: '100%',
    alignItems: 'center',
  },
  wrapTop: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    top: 0,
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
    ...StyleSheet.absoluteFill,
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
  tint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(18,18,22,0.32)' },
  sheen: { position: 'absolute', left: 0, right: 0, top: 0, height: '60%' },
  progress: { position: 'absolute', left: 28, right: 28, bottom: 0, height: 2, backgroundColor: 'rgba(243,239,232,0.12)' },
  progressFill: { height: '100%' },
  info: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.md },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontFamily: fonts.bold, color: colors.text, fontSize: 15, letterSpacing: -0.3 },
  subtitle: { fontFamily: fonts.medium, color: colors.textMuted, fontSize: 12.5, marginTop: 1 },
  zenIcon: { alignItems: 'center', justifyContent: 'center' },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.text,
  },
});
