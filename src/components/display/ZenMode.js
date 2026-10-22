import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { usePlayer } from '../../context/PlayerContext';
import { formatRemaining, useSleepRemaining } from '../../context/SleepTimerContext';
import useNowPlaying from '../../hooks/useNowPlaying';
import { podcastById } from '../../data/podcasts';
import StationLogo from '../StationLogo';
import PodcastCover from '../PodcastCover';
import BoaLogo from '../BoaLogo';
import { SleepButton } from '../SleepTimerMenu';
import { PulseDot, Slate } from '../ui';
import { colors, fonts, space } from '../../theme';

const SLOW = Easing.inOut(Easing.sin);

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// "10:47" and "AM" apart, so a 12-hour clock's day period can sit small
// beside the digits instead of being drawn as large as them.
function clockParts(date) {
  const format = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  if (!format.formatToParts) return { time: format.format(date), period: null };
  const parts = format.formatToParts(date);
  return {
    time: parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim(),
    period: parts.find((p) => p.type === 'dayPeriod')?.value ?? null,
  };
}

/** Whatever's loaded, as artwork: station logo, podcast cover, else BOA. */
function Artwork({ current, size }) {
  if (current?.kind === 'podcast') {
    const podcast = podcastById(current.podcastId);
    if (podcast) return <PodcastCover podcast={podcast} size={size} rounded={size / 2} />;
  }
  if (current) return <StationLogo station={current} size={size} rounded={size / 2} fit="cover" />;
  return <BoaLogo height={size * 0.4} />;
}

function SleepCountdown() {
  const remaining = useSleepRemaining();
  if (!remaining) return null;
  return <Text style={styles.sleepText}>{formatRemaining(remaining)}</Text>;
}

/**
 * Screensaver: a big clock drifting slowly (so nothing sits still long
 * enough to burn in), over the station's artwork breathing in the dark.
 * Covers the tab bar and headers; any tap wakes the app.
 */
export default function ZenMode({ onExit }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { current, status, trackTitle } = usePlayer();
  const nowPlaying = useNowPlaying(current, current?.kind === 'radio');
  const now = useNow();

  const breathe = useSharedValue(0);
  const driftX = useSharedValue(0);
  const driftY = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    breathe.value = withRepeat(withTiming(1, { duration: 4500, easing: SLOW }), -1, true);
    // Different periods on each axis, so the path never quite repeats.
    driftX.value = withRepeat(withTiming(1, { duration: 19000, easing: SLOW }), -1, true);
    driftY.value = withDelay(3000, withRepeat(withTiming(1, { duration: 27000, easing: SLOW }), -1, true));
  }, [reduceMotion, breathe, driftX, driftY]);

  const artStyle = useAnimatedStyle(() => ({
    opacity: 0.16 + breathe.value * 0.16,
    transform: [{ scale: 0.96 + breathe.value * 0.08 }],
  }));
  const clockStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (driftX.value - 0.5) * width * 0.08 }, { translateY: (driftY.value - 0.5) * height * 0.08 }],
  }));

  const { time, period } = clockParts(now);
  const date = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const clockSize = Math.round(Math.min(width * 0.2, height * 0.32, 220));
  const artSize = Math.round(Math.min(width, height) * 0.7);
  const podcast = current?.kind === 'podcast' ? podcastById(current.podcastId) : null;
  const track = podcast ? current.name : trackTitle || nowPlaying;
  const source = podcast ? podcast.title : current?.name;
  const onAir = status === 'playing';

  return (
    <Animated.View entering={FadeIn.duration(900)} exiting={FadeOut.duration(350)} style={styles.screen}>
      <StatusBar hidden />
      <Pressable style={StyleSheet.absoluteFill} onPress={onExit} accessibilityRole="button" accessibilityLabel="Exit Zen Mode" />

      <View pointerEvents="none" style={styles.center}>
        <Animated.View style={[styles.art, artStyle]}>
          <Artwork current={current} size={artSize} />
        </Animated.View>
      </View>
      <View pointerEvents="none" style={styles.veil} />

      <View pointerEvents="none" style={styles.center}>
        <Animated.View style={[styles.clockBlock, clockStyle]}>
          <Slate>{date}</Slate>
          <Text style={[styles.clock, { fontSize: clockSize, lineHeight: clockSize * 1.05 }]} accessibilityRole="timer">
            {time}
            {period ? <Text style={[styles.period, { fontSize: Math.round(clockSize * 0.26) }]}> {period}</Text> : null}
          </Text>
          {source ? (
            <View style={styles.nowRow}>
              <PulseDot color={onAir ? colors.live : colors.gold} size={7} />
              <Text style={styles.source} numberOfLines={1}>
                {source}
              </Text>
            </View>
          ) : null}
          {track ? (
            <Text style={styles.track} numberOfLines={2}>
              {track}
            </Text>
          ) : null}
        </Animated.View>
      </View>

      <View style={[styles.corner, { bottom: insets.bottom + space.xl, right: insets.right + space.xl }]}>
        <SleepCountdown />
        <SleepButton size={44} />
      </View>
      <Animated.Text
        entering={FadeIn.delay(600)}
        pointerEvents="none"
        style={[styles.hint, { bottom: insets.bottom + space.xl + 14 }]}
      >
        Tap anywhere to wake
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', zIndex: 900 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  art: { alignItems: 'center', justifyContent: 'center' },
  // Pulls the artwork down to atmosphere so the clock reads clearly over it.
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  clockBlock: { alignItems: 'center', paddingHorizontal: space.xl, maxWidth: '100%' },
  clock: {
    fontFamily: fonts.light,
    color: colors.text,
    letterSpacing: -4,
    fontVariant: ['tabular-nums'],
    marginTop: space.sm,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 30,
  },
  period: { fontFamily: fonts.regular, letterSpacing: 1, color: colors.textMuted },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: space.md, maxWidth: 560 },
  source: { fontFamily: fonts.semibold, fontSize: 17, color: colors.text, letterSpacing: -0.3, flexShrink: 1 },
  track: { fontFamily: fonts.medium, fontSize: 14.5, color: colors.textMuted, marginTop: 6, textAlign: 'center', maxWidth: 560 },
  corner: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: space.md },
  sleepText: { fontFamily: fonts.mono, fontSize: 13, color: colors.gold, letterSpacing: 1, fontVariant: ['tabular-nums'] },
  hint: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
});
