import { Component, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { setStatusBarHidden } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
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
import { cachedGlow } from '../../api/stationColor';
import { parseHex, shiftHex } from '../../utils/color';
import { SleepButton } from '../SleepTimerMenu';
import DriftingFog from '../DriftingFog';
import Grain from '../Grain';
import { PulseDot, Slate } from '../ui';
import { colors, fonts, space } from '../../theme';

// The fade into Zen Mode: slow and soft, like a room's lights dimming.
const DIM = Easing.bezier(0.33, 0, 0.2, 1);
// Without a station colour the mesh glows in BOA's own amber.
const HOUSE_TONE = '#B9792A';
// Blobs are drawn this size and scaled up: a soft gradient loses nothing,
// and each one's bitmap stays tiny however big the screen.
const BLOB = 192;
// One full loop of the mesh. Every blob moves on whole multiples of it, so
// the loop is seamless.
const MESH_LOOP = 48000;

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const pad = (n) => String(n).padStart(2, '0');

// "10:47" and "AM" apart, so a 12-hour clock's day period can sit small
// beside the digits. Falls back to a plain 24-hour clock wherever Intl is
// missing or incomplete, rather than throwing.
function clockParts(date) {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).formatToParts(date);
    return {
      time: parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim(),
      period: parts.find((p) => p.type === 'dayPeriod')?.value ?? null,
    };
  } catch {
    return { time: `${pad(date.getHours())}:${pad(date.getMinutes())}`, period: null };
  }
}

function dateLine(date) {
  try {
    return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  } catch {
    return date.toDateString();
  }
}

/**
 * The station's glow colour as a valid hex, or null for the house tone. Only
 * a colour already known (curated, or extracted earlier by the radio screen)
 * is used: Zen Mode never starts native image work of its own.
 */
function useAmbientColor(current) {
  const [color, setColor] = useState(null);
  useEffect(() => {
    let alive = true;
    setColor(null);
    if (current?.kind === 'radio') {
      cachedGlow(current)
        .then((c) => alive && setColor(parseHex(c) ? c : null))
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [current]);
  return color;
}

// Where each blob of the mesh lives (fractions of the screen), how big it is
// (fraction of the long edge), how far it wanders and on which harmonics.
const BLOBS = [
  { x: 0.2, y: 0.18, size: 1.15, ax: 0.22, ay: 0.12, fx: 1, fy: 1, phase: 0, tone: [0, 0, 0] },
  { x: 0.85, y: 0.35, size: 0.95, ax: 0.16, ay: 0.18, fx: 1, fy: 2, phase: 1.9, tone: [-8, 0.04, -0.06] },
  { x: 0.3, y: 0.82, size: 1.05, ax: 0.2, ay: 0.1, fx: 2, fy: 1, phase: 3.4, tone: [-22, -0.02, -0.12] },
  { x: 0.78, y: 0.9, size: 0.85, ax: 0.14, ay: 0.14, fx: 1, fy: 1, phase: 4.8, tone: [4, 0.06, 0.08] },
];

function MeshBlob({ clock, blob, color, width, height, id }) {
  const long = Math.max(width, height);
  const size = long * blob.size;
  const scale = size / BLOB;
  const style = useAnimatedStyle(() => {
    const a = clock.value * Math.PI * 2;
    return {
      transform: [
        { translateX: Math.sin(a * blob.fx + blob.phase) * width * blob.ax },
        { translateY: Math.cos(a * blob.fy + blob.phase) * height * blob.ay },
        { scale: scale * (1 + Math.sin(a * 2 + blob.phase) * 0.08) },
      ],
    };
  });
  return (
    <Animated.View
      style={[{ position: 'absolute', left: width * blob.x - BLOB / 2, top: height * blob.y - BLOB / 2, width: BLOB, height: BLOB }, style]}
    >
      <Svg width={BLOB} height={BLOB}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.5} />
            <Stop offset="0.5" stopColor={color} stopOpacity={0.18} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={BLOB} height={BLOB} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * A fluid mesh gradient: four pools of colour, all tones of the station's
 * own, drifting over each other on one slow UI-thread clock. Still under
 * Reduce Motion.
 */
function MeshGradient({ color, width, height }) {
  const reduceMotion = useReducedMotion();
  const clock = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    clock.value = withRepeat(withTiming(1, { duration: MESH_LOOP, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(clock);
  }, [reduceMotion, clock]);
  const base = parseHex(color) ? color : HOUSE_TONE;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {BLOBS.map((blob, i) => (
        <MeshBlob
          key={i}
          id={`zen-mesh-${i}`}
          clock={clock}
          blob={blob}
          color={shiftHex(base, ...blob.tone)}
          width={width}
          height={height}
        />
      ))}
    </View>
  );
}

/**
 * Deep charcoal lit by the station's colour as a moving mesh, a breath of
 * drifting smoke over it, film grain, and edges that fall away to black.
 */
function Atmosphere({ color, width, height }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <MeshGradient color={color} width={width} height={height} />
      <DriftingFog width={width} height={height} opacity={0.7} />
      <Grain width={width} height={height} opacity={0.04} />
      {/* Vignette: the edges fall away to black so the clock sits in light. */}
      <LinearGradient
        colors={['rgba(5,5,6,0.7)', 'rgba(5,5,6,0)', 'rgba(5,5,6,0)', 'rgba(5,5,6,0.85)']}
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

// The clock, dead centre of the safe area, with the date hung above it and
// what's playing below, so neither shifts the digits.
function Clock({ width, height, short }) {
  const { current, status, trackTitle } = usePlayer();
  const nowPlaying = useNowPlaying(current, current?.kind === 'radio');
  const now = useNow();
  const { time, period } = clockParts(now);
  const clockSize = Math.round(Math.min(width * 0.22, height * 0.28, 210));
  const lineHeight = Math.round(clockSize * 1.04);
  // The digits ride high in their line box (room for descenders); nudge them
  // down so they, not the box, sit on the optical centre.
  const nudge = Math.round(clockSize * 0.08);
  const podcast = current?.kind === 'podcast' ? podcastById(current.podcastId) : null;
  const track = podcast ? current.name : trackTitle || nowPlaying;
  const source = podcast ? podcast.title : current?.name;
  const onAir = status === 'playing';
  return (
    <>
      <View pointerEvents="none" style={styles.center}>
        {/* The day period hangs off the digits' right edge, so the digits
            alone sit on the centre line. */}
        <View style={{ transform: [{ translateY: nudge }] }} accessibilityRole="timer" accessible>
          <Text style={[styles.clock, { fontSize: clockSize, lineHeight, letterSpacing: -clockSize * 0.035 }]}>{time}</Text>
          {period ? (
            <Text style={[styles.period, { fontSize: Math.round(clockSize * 0.24), bottom: Math.round(lineHeight * 0.16) }]}>
              {period}
            </Text>
          ) : null}
        </View>
      </View>
      <View pointerEvents="none" style={[styles.above, { bottom: (height + lineHeight) / 2 + space.sm - nudge }]}>
        <Slate>{dateLine(now)}</Slate>
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
    </>
  );
}

function Screensaver({ onExit }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  // Fades are plain opacity on the UI thread: no layout animations, which
  // are the riskiest thing to run while views mount and unmount.
  const shown = useSharedValue(0);
  const hint = useSharedValue(0);
  const leaving = useRef(false);

  useEffect(() => {
    shown.value = withTiming(1, { duration: reduceMotion ? 400 : 1800, easing: DIM });
    hint.value = withDelay(1600, withTiming(1, { duration: 1200 }));
    try {
      setStatusBarHidden(true, 'fade');
    } catch {}
    return () => {
      cancelAnimation(shown);
      cancelAnimation(hint);
      try {
        setStatusBarHidden(false, 'fade');
      } catch {}
    };
  }, [reduceMotion, shown, hint]);

  // Fade out, then wake. The timer, not an animation callback, does the
  // waking, so a tap always gets you out.
  const wake = () => {
    if (leaving.current) return;
    leaving.current = true;
    shown.value = withTiming(0, { duration: 300 });
    setTimeout(onExit, 300);
  };

  const screenStyle = useAnimatedStyle(() => ({ opacity: shown.value }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: hint.value }));
  const { current } = usePlayer();
  const ambient = useAmbientColor(current);
  const short = height < 500;
  const controlsBottom = Math.max(insets.bottom, space.lg) + space.md;
  const safe = {
    top: insets.top,
    bottom: insets.bottom,
    left: insets.left,
    right: insets.right,
  };
  const safeWidth = width - insets.left - insets.right;
  const safeHeight = height - insets.top - insets.bottom;

  return (
    <Animated.View style={[styles.screen, screenStyle]}>
      <Atmosphere color={ambient} width={width} height={height} />
      <Pressable style={StyleSheet.absoluteFill} onPress={wake} accessibilityRole="button" accessibilityLabel="Exit Zen Mode" />

      <View pointerEvents="none" style={[styles.safe, safe]}>
        <Clock width={safeWidth} height={safeHeight} short={short} />
      </View>

      <View
        pointerEvents="box-none"
        style={[styles.bottomBar, { left: insets.left + space.xl, right: insets.right + space.xl, bottom: controlsBottom }]}
      >
        {short ? (
          <View />
        ) : (
          <Animated.Text pointerEvents="none" style={[styles.hint, hintStyle]}>
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

/**
 * If anything in the screensaver ever fails to draw, wake the app instead
 * of taking it down.
 */
class ZenBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onExit();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Screensaver: a big, still clock dead centre of the safe area over a slow,
 * cinematic atmosphere (a mesh of the station's colour, drifting smoke and
 * grain), so the moving light rather than the clock keeps the screen from
 * burning in. Covers the tab bar and headers; any tap wakes the app.
 */
export default function ZenMode({ onExit }) {
  return (
    <ZenBoundary onExit={onExit}>
      <Screensaver onExit={onExit} />
    </ZenBoundary>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg, zIndex: 900, overflow: 'hidden' },
  safe: { position: 'absolute' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  above: { position: 'absolute', left: space.xl, right: space.xl, alignItems: 'center' },
  below: { position: 'absolute', left: space.xl, right: space.xl, alignItems: 'center' },
  clock: {
    fontFamily: fonts.extralight,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  period: { position: 'absolute', left: '100%', marginLeft: space.sm, fontFamily: fonts.serif, color: colors.gold },
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
