import { Component, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { setStatusBarHidden } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
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
// The clock group wanders this far (pt) over this long, against burn-in.
const DRIFT = 10;
const DRIFT_LOOP = 180000;
const KEEP_AWAKE_TAG = 'boa-zen';

// Re-renders on the minute, not every second: the sweep under the clock
// shows the seconds, on the UI thread.
function useMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let id;
    const schedule = () => {
      const d = new Date();
      id = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 20);
    };
    schedule();
    return () => clearTimeout(id);
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

// A gold hairline that fills across each minute, with a bright bead riding
// its leading edge. Runs on the UI thread from one timing per minute.
function MinuteSweep({ now, width }) {
  const reduceMotion = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    const d = new Date();
    const into = d.getSeconds() * 1000 + d.getMilliseconds();
    p.value = into / 60000;
    if (!reduceMotion) p.value = withTiming(1, { duration: Math.max(0, 60000 - into), easing: Easing.linear });
    return () => cancelAnimation(p);
  }, [now, reduceMotion, p]);
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value }] }));
  const bead = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * width - 3 }] }));
  return (
    <View pointerEvents="none" style={[styles.sweep, { width }]}>
      <Animated.View style={[styles.sweepFill, { width }, fill]} />
      <Animated.View style={[styles.bead, bead]} />
    </View>
  );
}

// The digits as separate glyphs, so only the ones that change roll in: a
// new minute rises into place while the rest of the time holds still.
function Digits({ time, size, lineHeight }) {
  return (
    <View style={styles.digits}>
      {time.split('').map((ch, i) => (
        <Animated.View key={`${i}-${ch}`} entering={FadeInDown.duration(700).springify().damping(22)}>
          <Text style={[styles.clock, { fontSize: size, lineHeight, letterSpacing: -size * 0.035 }]}>{ch}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

// The clock, dead centre of the safe area, with the date hung above it and
// what's playing below, so neither shifts the digits. The whole group
// drifts a few points on a slow loop so nothing burns in.
function Clock({ width, height, short }) {
  const { current, status, trackTitle } = usePlayer();
  const nowPlaying = useNowPlaying(current, current?.kind === 'radio');
  const reduceMotion = useReducedMotion();
  const now = useMinute();
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

  const drift = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    drift.value = withRepeat(withTiming(1, { duration: DRIFT_LOOP, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(drift);
  }, [reduceMotion, drift]);
  const driftStyle = useAnimatedStyle(() => {
    const a = drift.value * Math.PI * 2;
    return { transform: [{ translateX: Math.sin(a) * DRIFT }, { translateY: Math.sin(a * 2) * DRIFT * 0.6 }] };
  });

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, driftStyle]}>
      <View style={styles.center}>
        {/* The day period hangs off the digits' right edge, so the digits
            alone sit on the centre line. */}
        <View style={{ transform: [{ translateY: nudge }] }} accessibilityRole="timer" accessibilityLabel={`${time}${period ? ` ${period}` : ''}`} accessible>
          <Digits time={time} size={clockSize} lineHeight={lineHeight} />
          {period ? (
            <Text style={[styles.period, { fontSize: Math.round(clockSize * 0.24), bottom: Math.round(lineHeight * 0.16) }]}>
              {period}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={[styles.above, { bottom: (height + lineHeight) / 2 + space.sm - nudge }]}>
        <Slate>{dateLine(now)}</Slate>
      </View>
      <View style={[styles.below, { top: (height + lineHeight) / 2 + nudge }]}>
        <MinuteSweep now={now} width={Math.round(Math.min(clockSize * 1.8, width * 0.5))} />
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
    </Animated.View>
  );
}

// Frosted round control for the active screensaver.
function GlassButton({ icon, label, onPress, size = 48, primary, disabled, children }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.glass,
        { width: size, height: size, borderRadius: size / 2 },
        primary && styles.glassPrimary,
        disabled && { opacity: 0.35 },
        pressed && { transform: [{ scale: 0.92 }] },
      ]}
    >
      {children ?? <Ionicons name={icon} size={Math.round(size * 0.42)} color={primary ? colors.bg : colors.text} />}
    </Pressable>
  );
}

// Previous, play/pause and next for what's playing.
function Transport() {
  const { current, status, isPlaying, toggle, next, previous, canStep } = usePlayer();
  if (!current) return null;
  return (
    <View style={styles.transport}>
      {canStep && <GlassButton icon="play-skip-back" label="Previous station" onPress={previous} />}
      <GlassButton label={isPlaying ? 'Pause' : 'Play'} onPress={() => toggle()} size={64} primary>
        {status === 'loading' ? (
          <ActivityIndicator color={colors.bg} />
        ) : (
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={26} color={colors.bg} style={isPlaying ? null : { marginLeft: 3 }} />
        )}
      </GlassButton>
      {canStep && <GlassButton icon="play-skip-forward" label="Next station" onPress={next} />}
    </View>
  );
}

/**
 * Active Zen Mode (started by hand) carries its controls: close, the
 * transport and the sleep timer; a tap on the backdrop tucks them away and
 * brings them back. Passive Zen Mode (the idle screensaver) is just the
 * picture, and any tap wakes the app.
 */
function Screensaver({ mode, onExit }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const active = mode === 'active';
  const [chromeOn, setChromeOn] = useState(active);
  // Fades are plain opacity on the UI thread: no layout animations on the
  // screen itself, which are the riskiest thing to run while views mount
  // and unmount.
  const shown = useSharedValue(0);
  const hint = useSharedValue(0);
  const chrome = useSharedValue(0);
  const leaving = useRef(false);

  useEffect(() => {
    shown.value = withTiming(1, { duration: reduceMotion ? 400 : active ? 900 : 1800, easing: DIM });
    if (!active) hint.value = withDelay(1600, withTiming(1, { duration: 1200 }));
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
  }, [active, reduceMotion, shown, hint]);

  useEffect(() => {
    chrome.value = withDelay(chromeOn ? 500 : 0, withTiming(chromeOn ? 1 : 0, { duration: chromeOn ? 600 : 400, easing: DIM }));
    return () => cancelAnimation(chrome);
  }, [chromeOn, chrome]);

  // Fade out, then wake. The timer, not an animation callback, does the
  // waking, so a tap always gets you out.
  const wake = () => {
    if (leaving.current) return;
    leaving.current = true;
    shown.value = withTiming(0, { duration: 300 });
    setTimeout(onExit, 300);
  };
  const onBackdrop = () => (active ? setChromeOn((on) => !on) : wake());

  const screenStyle = useAnimatedStyle(() => ({ opacity: shown.value }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: hint.value }));
  const chromeStyle = useAnimatedStyle(() => ({ opacity: chrome.value }));
  const { current, isPlaying } = usePlayer();
  const ambient = useAmbientColor(current);

  // While music plays, the screensaver holds the screen on, like a bedside
  // display; with nothing playing the phone sleeps as it normally would.
  useEffect(() => {
    if (!isPlaying) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      try {
        deactivateKeepAwake(KEEP_AWAKE_TAG);
      } catch {}
    };
  }, [isPlaying]);

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
  const edge = { left: insets.left + space.xl, right: insets.right + space.xl };

  return (
    <Animated.View style={[styles.screen, screenStyle]}>
      <Atmosphere color={ambient} width={width} height={height} />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onBackdrop}
        accessibilityRole="button"
        accessibilityLabel={active ? (chromeOn ? 'Hide controls' : 'Show controls') : 'Exit Zen Mode'}
      />

      <View pointerEvents="none" style={[styles.safe, safe]}>
        <Clock width={safeWidth} height={safeHeight} short={short} />
      </View>

      {active ? (
        <Animated.View
          entering={FadeIn.duration(400)}
          pointerEvents={chromeOn ? 'box-none' : 'none'}
          style={[StyleSheet.absoluteFill, chromeStyle]}
        >
          <View style={[styles.topBar, edge, { top: Math.max(insets.top, space.lg) + space.sm }]} pointerEvents="box-none">
            <Slate dot color={colors.text}>
              Zen Mode
            </Slate>
            <GlassButton icon="close" label="Close Zen Mode" onPress={wake} size={44} />
          </View>
          <View style={[styles.bottomBar, edge, { bottom: controlsBottom }]} pointerEvents="box-none">
            <View style={styles.side} />
            <Transport />
            <View style={[styles.side, styles.corner]}>
              <SleepCountdown />
              <SleepButton size={44} />
            </View>
          </View>
        </Animated.View>
      ) : (
        !short && (
          <View pointerEvents="none" style={[styles.hintRow, edge, { bottom: controlsBottom + space.sm }]}>
            <Animated.Text style={[styles.hint, hintStyle]}>Tap anywhere to wake</Animated.Text>
          </View>
        )
      )}
    </Animated.View>
  );
}

/**
 * If anything in Zen Mode ever fails to draw, it closes and hands the app
 * back rather than leaving a broken layer over it.
 */
class ZenBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.warn('Zen Mode closed after an error:', error?.message ?? error);
    // After this commit, never during it.
    setTimeout(() => this.props.onExit(), 0);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Screensaver: a big, still clock dead centre of the safe area over a slow,
 * cinematic atmosphere (a mesh of the station's colour, drifting smoke and
 * grain), so the moving light rather than the clock keeps the screen from
 * burning in. An absolute layer over the whole app (zIndex, and elevation
 * on Android, so native screens can't draw over it), not a Modal: a Modal
 * opened while the app is in the background can come back as an invisible
 * window that swallows every touch. Android's back button closes it.
 */
function ZenLayer({ mode, onExit }) {
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onExit();
      return true;
    });
    return () => sub.remove();
  }, [onExit]);
  return (
    <View style={styles.layer}>
      <Screensaver mode={mode} onExit={onExit} />
    </View>
  );
}

export default function ZenMode({ mode = 'active', onExit }) {
  return (
    <ZenBoundary onExit={onExit}>
      <ZenLayer mode={mode} onExit={onExit} />
    </ZenBoundary>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg, overflow: 'hidden' },
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 9999, elevation: Platform.OS === 'android' ? 9999 : 0 },
  safe: { position: 'absolute' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  above: { position: 'absolute', left: space.xl, right: space.xl, alignItems: 'center' },
  below: { position: 'absolute', left: space.xl, right: space.xl, alignItems: 'center' },
  digits: { flexDirection: 'row', justifyContent: 'center' },
  clock: {
    fontFamily: fonts.extralight,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  period: { position: 'absolute', left: '100%', marginLeft: space.sm, fontFamily: fonts.serif, color: colors.gold },
  sweep: { height: 2, marginTop: space.sm, borderRadius: 1, backgroundColor: 'rgba(243,239,232,0.10)', justifyContent: 'center' },
  sweepFill: { position: 'absolute', left: 0, height: 2, borderRadius: 1, backgroundColor: 'rgba(226,168,75,0.7)', transformOrigin: 'left' },
  bead: {
    position: 'absolute',
    left: 0,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.gold,
    boxShadow: '0px 0px 10px rgba(226,168,75,0.9)',
  },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: space.lg, maxWidth: 560 },
  source: { fontFamily: fonts.semibold, fontSize: 17, color: colors.text, letterSpacing: -0.3, flexShrink: 1 },
  track: { fontFamily: fonts.medium, fontSize: 14.5, color: colors.textMuted, marginTop: 6, textAlign: 'center', maxWidth: 560 },
  topBar: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bottomBar: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  side: { flex: 1, flexDirection: 'row' },
  corner: { justifyContent: 'flex-end', alignItems: 'center', gap: space.md },
  transport: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  glass: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18,18,22,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  glassPrimary: { backgroundColor: colors.text, borderColor: colors.text, boxShadow: '0px 10px 30px rgba(0,0,0,0.5)' },
  hintRow: { position: 'absolute', alignItems: 'center' },
  sleepText: { fontFamily: fonts.mono, fontSize: 13, color: colors.gold, letterSpacing: 1, fontVariant: ['tabular-nums'] },
  hint: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
});
