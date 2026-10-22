import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { usePlayer } from '../../context/PlayerContext';
import { formatRemaining, useSleepRemaining } from '../../context/SleepTimerContext';
import useNowPlaying from '../../hooks/useNowPlaying';
import { podcastById } from '../../data/podcasts';
import { FALLBACK_GLOW, glowFor } from '../../api/stationColor';
import { SleepButton } from '../SleepTimerMenu';
import DriftingFog from '../DriftingFog';
import { PulseDot, Slate } from '../ui';
import { colors, fonts, space } from '../../theme';

const SLOW = Easing.inOut(Easing.sin);
// The fade into Zen Mode: slow and soft, like a room's lights dimming.
const DIM = Easing.bezier(0.33, 0, 0.2, 1);

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

/** The station's glow colour, or null for plain charcoal. */
function useAmbientColor(current) {
  const [color, setColor] = useState(null);
  useEffect(() => {
    let alive = true;
    setColor(null);
    if (current?.kind === 'radio') {
      glowFor(current).then((c) => alive && setColor(c === FALLBACK_GLOW ? null : c));
    }
    return () => {
      alive = false;
    };
  }, [current]);
  return color;
}

/** A soft radial pool of colour that wanders and breathes. */
function Bloom({ color, size, x, y, period, delay = 0, id }) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    const timer = setTimeout(() => {
      t.value = withRepeat(withTiming(1, { duration: period, easing: SLOW }), -1, true);
    }, delay);
    return () => clearTimeout(timer);
  }, [reduceMotion, period, delay, t]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.55 + t.value * 0.45,
    transform: [
      { translateX: (t.value - 0.5) * size * 0.22 },
      { translateY: (0.5 - t.value) * size * 0.14 },
      { scale: 0.92 + t.value * 0.16 },
    ],
  }));
  return (
    <Animated.View
      entering={FadeIn.duration(2400)}
      style={[{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size }, style]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.42} />
            <Stop offset="0.45" stopColor={color} stopOpacity={0.16} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * Deep charcoal lit by the station's colour, with two layers of smoke
 * drifting across it at different speeds.
 */
function Atmosphere({ color, width, height }) {
  const long = Math.max(width, height);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {color && (
        <>
          <LinearGradient
            colors={[`${color}38`, `${color}10`, 'transparent']}
            locations={[0, 0.45, 1]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Bloom id="zen-bloom-a" color={color} size={long * 1.1} x={width * 0.25} y={height * 0.2} period={17000} />
          <Bloom id="zen-bloom-b" color={color} size={long * 0.9} x={width * 0.8} y={height * 0.85} period={23000} delay={4000} />
        </>
      )}
      <DriftingFog width={width} height={height} />
      {/* Vignette: the edges fall away to black so the clock sits in light. */}
      <LinearGradient
        colors={['rgba(5,5,6,0.75)', 'rgba(5,5,6,0)', 'rgba(5,5,6,0)', 'rgba(5,5,6,0.85)']}
        locations={[0, 0.3, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function SleepCountdown() {
  const remaining = useSleepRemaining();
  if (!remaining) return null;
  return <Text style={styles.sleepText}>{formatRemaining(remaining)}</Text>;
}

/**
 * Screensaver: a big, still clock dead centre over a slow, cinematic
 * atmosphere (the station's colour and drifting fog), so the moving light
 * rather than the clock keeps the screen from burning in. Covers the tab bar
 * and headers; any tap wakes the app.
 */
export default function ZenMode({ onExit }) {
  const window = useWindowDimensions();
  // Lay out against the space Zen Mode really covers, which on Android can
  // differ from the window (edge-to-edge, system bars).
  const [frame, setFrame] = useState(null);
  const { width, height } = frame ?? window;
  const insets = useSafeAreaInsets();
  const { current, status, trackTitle } = usePlayer();
  const nowPlaying = useNowPlaying(current, current?.kind === 'radio');
  const ambient = useAmbientColor(current);
  const now = useNow();

  const { time, period } = clockParts(now);
  const date = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const clockSize = Math.round(Math.min(width * 0.2, height * 0.26, 200));
  const lineHeight = Math.round(clockSize * 1.05);
  // The digits ride high in their line box (room for descenders); nudge them
  // down so they, not the box, sit on the optical centre.
  const nudge = Math.round(clockSize * 0.1);
  const podcast = current?.kind === 'podcast' ? podcastById(current.podcastId) : null;
  const track = podcast ? current.name : trackTitle || nowPlaying;
  const source = podcast ? podcast.title : current?.name;
  const onAir = status === 'playing';
  const short = height < 500;

  return (
    <Animated.View
      entering={FadeIn.duration(1800).easing(DIM)}
      exiting={FadeOut.duration(400)}
      style={styles.screen}
      onLayout={(e) => setFrame(e.nativeEvent.layout)}
    >
      <StatusBar hidden />
      <Atmosphere color={ambient} width={width} height={height} />
      <Pressable style={StyleSheet.absoluteFill} onPress={onExit} accessibilityRole="button" accessibilityLabel="Exit Zen Mode" />

      {/* The digits sit exactly on the screen's centre; the date hangs above
          them and what's playing below, so neither shifts the clock. */}
      <View pointerEvents="none" style={styles.center}>
        <Text
          style={[styles.clock, { fontSize: clockSize, lineHeight, transform: [{ translateY: nudge }] }]}
          accessibilityRole="timer"
        >
          {time}
          {period ? <Text style={[styles.period, { fontSize: Math.round(clockSize * 0.26) }]}> {period}</Text> : null}
        </Text>
      </View>
      <View pointerEvents="none" style={[styles.above, { bottom: (height + lineHeight) / 2 + space.sm - nudge }]}>
        <Slate>{date}</Slate>
      </View>
      <View pointerEvents="none" style={[styles.below, { top: (height + lineHeight) / 2 + nudge }]}>
        {source ? (
          <View style={styles.nowRow}>
            <PulseDot color={onAir ? colors.live : colors.gold} size={7} />
            <Text style={styles.source} numberOfLines={1}>
              {source}
            </Text>
          </View>
        ) : null}
        {track ? (
          <Text style={styles.track} numberOfLines={short ? 1 : 2}>
            {track}
          </Text>
        ) : null}
      </View>

      <View
        pointerEvents="box-none"
        style={[
          styles.bottomBar,
          {
            left: insets.left + space.xl,
            right: insets.right + space.xl,
            bottom: Math.max(insets.bottom, space.lg) + space.md,
          },
        ]}
      >
        {short ? (
          <View />
        ) : (
          <Animated.Text entering={FadeIn.delay(1600).duration(1200)} pointerEvents="none" style={styles.hint}>
            Tap anywhere to wake
          </Animated.Text>
        )}
        <View style={styles.corner}>
          <SleepCountdown />
          <SleepButton size={44} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg, zIndex: 900, overflow: 'hidden' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  above: { position: 'absolute', left: space.xl, right: space.xl, alignItems: 'center' },
  below: { position: 'absolute', left: space.xl, right: space.xl, alignItems: 'center' },
  clock: {
    fontFamily: fonts.light,
    color: colors.text,
    letterSpacing: -4,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 30,
  },
  period: { fontFamily: fonts.regular, letterSpacing: 1, color: colors.textMuted },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: space.md, maxWidth: 560 },
  source: { fontFamily: fonts.semibold, fontSize: 17, color: colors.text, letterSpacing: -0.3, flexShrink: 1 },
  track: { fontFamily: fonts.medium, fontSize: 14.5, color: colors.textMuted, marginTop: 6, textAlign: 'center', maxWidth: 560 },
  bottomBar: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  corner: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  sleepText: { fontFamily: fonts.mono, fontSize: 13, color: colors.gold, letterSpacing: 1, fontVariant: ['tabular-nums'] },
  hint: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
});
