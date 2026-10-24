import { Component, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
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
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { usePlayer } from '../../context/PlayerContext';
import { formatRemaining, useSleepRemaining, useSleepTimer } from '../../context/SleepTimerContext';
import useNowPlaying from '../../hooks/useNowPlaying';
import { podcastById } from '../../data/podcasts';
import { MEDIA_HEADERS, SCENES, SLEEP_TIMERS, SOUNDSCAPES, soundscapeById } from '../../data/sleep';
import * as ambient from '../../audio/ambient';
import { haptics } from '../../utils/haptics';
import { shiftHex } from '../../utils/color';
import DriftingFog from '../DriftingFog';
import Grain from '../Grain';
import { PulseDot, Slate } from '../ui';
import { colors, fonts, radius, space } from '../../theme';

// The fade into Zen Mode: slow and soft, like a room's lights dimming.
const DIM = Easing.bezier(0.33, 0, 0.2, 1);
// Under the photograph (and in its place if it can't load) the room glows
// in BOA's own amber.
const HOUSE_TONE = '#B9792A';
// Blobs are drawn this size and scaled up: a soft gradient loses nothing,
// and each one's bitmap stays tiny however big the screen.
const BLOB = 192;
// One full loop of the mesh. Every blob moves on whole multiples of it, so
// the loop is seamless.
const MESH_LOOP = 48000;
// The photograph's slow push-in and drift (Ken Burns), one way then back.
const KEN_BURNS_MS = 40000;
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

/** The soundscape engine's state: { id, status, volume }. */
function useAmbient() {
  const [state, setState] = useState(ambient.getState);
  useEffect(() => ambient.subscribe(setState), []);
  return state;
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
 * A fluid mesh gradient: four pools of amber drifting over each other on
 * one slow UI-thread clock. Still under Reduce Motion.
 */
function MeshGradient({ width, height }) {
  const reduceMotion = useReducedMotion();
  const clock = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    clock.value = withRepeat(withTiming(1, { duration: MESH_LOOP, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(clock);
  }, [reduceMotion, clock]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {BLOBS.map((blob, i) => (
        <MeshBlob
          key={i}
          id={`zen-mesh-${i}`}
          clock={clock}
          blob={blob}
          color={shiftHex(HOUSE_TONE, ...blob.tone)}
          width={width}
          height={height}
        />
      ))}
    </View>
  );
}

/**
 * The scene's photograph, filling the screen and drifting on a slow Ken
 * Burns loop. It fades in once it has actually loaded; until then (or if
 * it can't load) the amber mesh underneath is the room.
 */
function ScenePhoto({ scene, width, height }) {
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(0);
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    drift.value = withRepeat(withTiming(1, { duration: KEN_BURNS_MS, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(drift);
  }, [reduceMotion, drift]);
  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [
      { scale: 1.08 + drift.value * 0.1 },
      { translateX: (drift.value - 0.5) * width * 0.04 },
      { translateY: (0.5 - drift.value) * height * 0.03 },
    ],
  }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Image
        source={{ uri: scene.uri, headers: MEDIA_HEADERS }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
        testID={`zen-scene-${scene.id}`}
        onLoad={() => {
          shown.value = withTiming(1, { duration: 1600, easing: DIM });
        }}
        onError={(e) => console.warn(`[zen] scene ${scene.id} failed to load`, e?.nativeEvent?.error)}
      />
    </Animated.View>
  );
}

/**
 * The room: amber mesh, the scene's photograph over it (crossfading when
 * the scene changes), drifting smoke, film grain, and a deep shade so text
 * reads and the screen stays dim enough to sleep by.
 */
function Atmosphere({ sceneId, width, height }) {
  const scene = SCENES[sceneId] ?? SCENES.night;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <MeshGradient width={width} height={height} />
      <Animated.View key={scene.id} entering={FadeIn.duration(1400)} exiting={FadeOut.duration(1400)} style={StyleSheet.absoluteFill}>
        <ScenePhoto scene={scene} width={width} height={height} />
      </Animated.View>
      <DriftingFog width={width} height={height} opacity={0.5} />
      <Grain width={width} height={height} opacity={0.05} />
      <LinearGradient
        colors={['rgba(5,5,6,0.74)', 'rgba(5,5,6,0.5)', 'rgba(5,5,6,0.58)', 'rgba(5,5,6,0.92)']}
        locations={[0, 0.32, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
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
  const fill = useAnimatedStyle(() => ({ width: p.value * width }));
  const bead = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * width - 3 }] }));
  return (
    <View pointerEvents="none" style={[styles.sweep, { width }]}>
      <Animated.View style={[styles.sweepFill, fill]} />
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
        <Animated.View key={`${i}-${ch}`} entering={FadeInDown.duration(700)}>
          <Text style={[styles.clock, { fontSize: size, lineHeight, letterSpacing: -size * 0.035 }]}>{ch}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

// Three bars bouncing out of step: the soundscape that's playing.
function Equalizer({ color = colors.gold }) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    t.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(t);
  }, [reduceMotion, t]);
  const a = useAnimatedStyle(() => ({ height: 4 + t.value * 10 }));
  const b = useAnimatedStyle(() => ({ height: 12 - t.value * 8 }));
  const c = useAnimatedStyle(() => ({ height: 6 + (1 - Math.abs(t.value - 0.5) * 2) * 8 }));
  return (
    <View style={styles.eq} accessibilityElementsHidden>
      {[a, b, c].map((s, i) => (
        <Animated.View key={i} style={[styles.eqBar, { backgroundColor: color }, s]} />
      ))}
    </View>
  );
}

// The clock, centred in the space it's given, with the date above it and
// the minute sweep below; the whole group drifts a few points on a slow
// loop so nothing burns in.
function Clock({ width, height, compact }) {
  const reduceMotion = useReducedMotion();
  const now = useMinute();
  const { time, period } = clockParts(now);
  const clockSize = Math.round(Math.max(48, Math.min(width * 0.22, height * (compact ? 0.42 : 0.3), 200)));
  const lineHeight = Math.round(clockSize * 1.04);
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
    <Animated.View pointerEvents="none" style={[styles.clockGroup, driftStyle]}>
      <Slate>{dateLine(now)}</Slate>
      <View
        style={{ marginTop: space.sm }}
        accessibilityRole="timer"
        accessibilityLabel={`${time}${period ? ` ${period}` : ''}`}
        accessible
      >
        <Digits time={time} size={clockSize} lineHeight={lineHeight} />
        {period ? (
          <Text style={[styles.period, { fontSize: Math.round(clockSize * 0.24), bottom: Math.round(lineHeight * 0.16) }]}>
            {period}
          </Text>
        ) : null}
      </View>
      <MinuteSweep now={now} width={Math.round(Math.min(clockSize * 1.8, width * 0.6))} />
    </Animated.View>
  );
}

// What's on: the soundscape and/or the radio, and when it fades out.
function NowLine({ sound }) {
  const { current, status, trackTitle } = usePlayer();
  const remaining = useSleepRemaining();
  const nowPlaying = useNowPlaying(current, current?.kind === 'radio');
  const podcast = current?.kind === 'podcast' ? podcastById(current.podcastId) : null;
  const radioLine = current ? [podcast ? podcast.title : current.name, podcast ? current.name : trackTitle || nowPlaying].filter(Boolean).join(' · ') : null;
  const scape = sound.id && sound.status !== 'idle' ? soundscapeById(sound.id) : null;
  const soundLine = scape ? `${scape.label} · ${scape.detail}` : null;
  const lines = [soundLine, radioLine].filter(Boolean);
  if (!lines.length && !remaining) return null;
  return (
    <View pointerEvents="none" style={styles.nowLine}>
      {lines.length > 0 && (
        <View style={styles.nowRow}>
          <PulseDot color={status === 'playing' || sound.status === 'playing' ? colors.live : colors.gold} size={7} />
          <Text style={styles.nowText} numberOfLines={1}>
            {lines.join('  +  ')}
          </Text>
        </View>
      )}
      {remaining ? <Text style={styles.fadeText}>Fades out in {formatRemaining(remaining)}</Text> : null}
    </View>
  );
}

// Frosted round control.
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

// One soundscape: tap to play it on a loop, tap again to pause.
function SoundCard({ sound, state }) {
  const on = state.id === sound.id && (state.status === 'playing' || state.status === 'loading');
  const loading = state.id === sound.id && state.status === 'loading';
  const failed = state.id === sound.id && state.status === 'error';
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        ambient.toggle(sound.id);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${on ? 'Pause' : 'Play'} ${sound.label}`}
      accessibilityState={{ selected: on }}
      style={({ pressed }) => [styles.card, on && styles.cardOn, pressed && { transform: [{ scale: 0.96 }] }]}
    >
      <View style={styles.cardTop}>
        <Ionicons name={sound.icon} size={20} color={on ? colors.gold : colors.text} />
        {loading ? <ActivityIndicator size="small" color={colors.gold} /> : on ? <Equalizer /> : null}
      </View>
      <Text style={[styles.cardLabel, on && { color: colors.gold }]} numberOfLines={1}>
        {sound.label}
      </Text>
      <Text style={styles.cardDetail} numberOfLines={1}>
        {failed ? "Couldn't load. Tap to retry" : sound.detail}
      </Text>
    </Pressable>
  );
}

// Fade-out timer: Off, or 15 to 90 minutes, then the sound drifts away.
function TimerRow() {
  const { active, start, cancel } = useSleepTimer();
  const remaining = useSleepRemaining();
  const [chosen, setChosen] = useState(null);
  useEffect(() => {
    if (!active) setChosen(null);
  }, [active]);
  const pick = (minutes) => {
    haptics.selection();
    if (minutes == null) {
      cancel();
      setChosen(null);
    } else {
      start(minutes);
      setChosen(minutes);
    }
  };
  return (
    <View>
      <View style={styles.rowHead}>
        <Slate>Fade out</Slate>
        {active ? <Text style={styles.countdown}>{formatRemaining(remaining)}</Text> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {[null, ...SLEEP_TIMERS].map((m) => {
          const on = m == null ? !active : active && chosen === m;
          return (
            <Pressable
              key={m ?? 'off'}
              onPress={() => pick(m)}
              accessibilityRole="button"
              accessibilityLabel={m == null ? 'No fade-out timer' : `Fade out in ${m} minutes`}
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{m == null ? 'Off' : m < 60 ? `${m} min` : `${m / 60 === 1 ? '1 hr' : `${m / 60} hr`}`}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// Previous, play/pause and next for the radio, when there is any.
function Transport() {
  const { current, status, isPlaying, toggle, next, previous, canStep } = usePlayer();
  if (!current) return null;
  return (
    <View style={styles.transport}>
      {canStep && <GlassButton icon="play-skip-back" label="Previous station" onPress={previous} size={40} />}
      <GlassButton label={isPlaying ? 'Pause radio' : 'Play radio'} onPress={() => toggle()} size={48} primary>
        {status === 'loading' ? (
          <ActivityIndicator color={colors.bg} />
        ) : (
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color={colors.bg} style={isPlaying ? null : { marginLeft: 2 }} />
        )}
      </GlassButton>
      {canStep && <GlassButton icon="play-skip-forward" label="Next station" onPress={next} size={40} />}
    </View>
  );
}

// Who made the sounds and pictures, and under which licence.
function Credits({ onClose }) {
  const items = [
    ...SOUNDSCAPES.map((s) => ({ key: s.id, kind: 'Sound', ...s })),
    ...Object.values(SCENES).map((s) => ({ key: `scene-${s.id}`, kind: 'Photo', ...s })),
  ];
  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)} style={styles.credits}>
      <View style={styles.rowHead}>
        <Slate dot>Credits</Slate>
        <GlassButton icon="close" label="Close credits" onPress={onClose} size={36} />
      </View>
      <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: space.md, paddingTop: space.md }}>
        {items.map((c) => (
          <Pressable key={c.key} onPress={() => Linking.openURL(c.source)} accessibilityRole="link">
            <Text style={styles.creditTitle}>
              {c.kind} · {c.title}
            </Text>
            <Text style={styles.creditDetail}>
              {c.author} · {c.license}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

/**
 * The Sleep & Meditation Hub. Active (opened by hand): the room, the clock,
 * soundscapes, the fade-out timer, radio controls and credits; tapping the
 * backdrop tucks the controls away and brings them back. Passive (the idle
 * or lock screensaver): just the room, the clock and what's playing; any
 * tap wakes the app.
 */
function Hub({ mode, onExit }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const active = mode === 'active';
  const [chromeOn, setChromeOn] = useState(active);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const sound = useAmbient();
  const { isPlaying } = usePlayer();
  const shown = useSharedValue(0);
  const hint = useSharedValue(0);
  const chrome = useSharedValue(active ? 1 : 0);
  const leaving = useRef(false);

  useEffect(() => {
    shown.value = withTiming(1, { duration: reduceMotion ? 300 : active ? 700 : 1600, easing: DIM });
    if (!active) hint.value = withDelay(1400, withSequence(withTiming(1, { duration: 1200 }), withDelay(5000, withTiming(0.35, { duration: 1500 }))));
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
    chrome.value = withTiming(chromeOn ? 1 : 0, { duration: chromeOn ? 450 : 350, easing: DIM });
    return () => cancelAnimation(chrome);
  }, [chromeOn, chrome]);

  // While anything plays, the screen stays on like a bedside display; with
  // nothing playing the phone sleeps as it normally would.
  const audible = isPlaying || sound.status === 'playing';
  useEffect(() => {
    if (!audible) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      try {
        deactivateKeepAwake(KEEP_AWAKE_TAG);
      } catch {}
    };
  }, [audible]);

  // Fade out, then wake. A timer, not an animation callback, does the
  // waking, so a tap always gets you out.
  const wake = () => {
    if (leaving.current) return;
    leaving.current = true;
    shown.value = withTiming(0, { duration: 260 });
    setTimeout(onExit, 260);
  };
  const onBackdrop = () => (active ? setChromeOn((on) => !on) : wake());

  const screenStyle = useAnimatedStyle(() => ({ opacity: shown.value }));
  const hintStyle = useAnimatedStyle(() => ({ opacity: hint.value }));
  const chromeStyle = useAnimatedStyle(() => ({ opacity: chrome.value }));

  const sceneId = soundscapeById(sound.id)?.scene ?? 'night';
  const short = height < 500;
  const top = Math.max(insets.top, space.lg);
  const bottom = Math.max(insets.bottom, space.lg);
  const edge = { left: insets.left + space.xl, right: insets.right + space.xl };
  // Room for the clock: the panel takes the lower part of the screen when
  // the controls are out (the right half on a phone on its side).
  const panelBeside = active && short;
  const clockArea = {
    top: top + (active ? 56 : 0),
    bottom: active && !panelBeside ? bottom + (short ? 0 : 300) : bottom + 40,
    left: insets.left,
    right: panelBeside ? width / 2 : insets.right,
  };
  const clockW = width - clockArea.left - clockArea.right;
  const clockH = height - clockArea.top - clockArea.bottom;

  return (
    <Animated.View style={[styles.screen, screenStyle]} testID={`zen-${mode}`}>
      <Atmosphere sceneId={sceneId} width={width} height={height} />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onBackdrop}
        accessibilityRole="button"
        accessibilityLabel={active ? (chromeOn ? 'Hide controls' : 'Show controls') : 'Exit Zen Mode'}
      />

      <View pointerEvents="none" style={[styles.clockArea, clockArea]}>
        <Clock width={clockW} height={clockH} compact={short} />
        <NowLine sound={sound} />
      </View>

      {active ? (
        <Animated.View pointerEvents={chromeOn ? 'box-none' : 'none'} style={[StyleSheet.absoluteFill, chromeStyle]}>
          <View style={[styles.topBar, edge, { top }]} pointerEvents="box-none">
            <Slate dot color={colors.text}>
              Sleep & Meditation
            </Slate>
            <GlassButton icon="close" label="Close Zen Mode" onPress={wake} size={44} />
          </View>

          <View
            pointerEvents="box-none"
            style={[
              styles.panel,
              panelBeside
                ? { top: top + 56, bottom, right: insets.right + space.lg, width: width / 2 - space.xl }
                : { left: insets.left + space.lg, right: insets.right + space.lg, bottom },
            ]}
          >
            <ScrollView contentContainerStyle={styles.panelBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Slate>Soundscapes</Slate>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
                {SOUNDSCAPES.map((s) => (
                  <SoundCard key={s.id} sound={s} state={sound} />
                ))}
              </ScrollView>
              <TimerRow />
              <View style={styles.footer}>
                <Pressable onPress={() => setCreditsOpen(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Sound and photo credits">
                  <Text style={styles.creditsLink}>Credits</Text>
                </Pressable>
                <Transport />
              </View>
            </ScrollView>
          </View>
          {creditsOpen && (
            <View style={[StyleSheet.absoluteFill, styles.creditsWrap]} pointerEvents="box-none">
              <Credits onClose={() => setCreditsOpen(false)} />
            </View>
          )}
        </Animated.View>
      ) : (
        !short && (
          <View pointerEvents="none" style={[styles.hintRow, edge, { bottom: bottom + space.md }]}>
            <Animated.Text style={[styles.hint, hintStyle]}>Tap anywhere to wake</Animated.Text>
          </View>
        )
      )}
    </Animated.View>
  );
}

/**
 * If anything in Zen Mode ever fails to draw, it closes, hands the app
 * back, and reports what went wrong (shown briefly as a banner) rather than
 * leaving a broken layer over the app or quietly doing nothing.
 */
class ZenBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.warn('Zen Mode closed after an error:', error?.message ?? error);
    // After this commit, never during it.
    setTimeout(() => {
      this.props.onError?.(error);
      this.props.onExit();
    }, 0);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Zen Mode opens in its own full-screen window (a Modal), the same way the
 * app's sheets do, so nothing in the app, Android's native tab screens
 * included, can draw over it. It is only ever opened while the app is in
 * the foreground (see DisplayContext): a Modal opened in the background can
 * come back as an invisible window that swallows every touch. Inside it the
 * hub is an absolute layer at zIndex 9999. Back closes it.
 */
export default function ZenMode({ mode = 'active', onExit, onError }) {
  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right', 'portrait-upside-down']}
      onRequestClose={onExit}
    >
      <View style={styles.layer}>
        <ZenBoundary onExit={onExit} onError={onError}>
          <Hub mode={mode} onExit={onExit} />
        </ZenBoundary>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 9999, elevation: 9999 },
  screen: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg, overflow: 'hidden' },
  clockArea: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  clockGroup: { alignItems: 'center' },
  digits: { flexDirection: 'row', justifyContent: 'center' },
  clock: {
    fontFamily: fonts.extralight,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  period: { position: 'absolute', left: '100%', marginLeft: space.sm, fontFamily: fonts.serif, color: colors.gold },
  sweep: { height: 2, marginTop: space.md, borderRadius: 1, backgroundColor: 'rgba(243,239,232,0.12)', justifyContent: 'center' },
  sweepFill: { position: 'absolute', left: 0, height: 2, borderRadius: 1, backgroundColor: 'rgba(226,168,75,0.75)' },
  bead: { position: 'absolute', left: 0, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gold },
  nowLine: { alignItems: 'center', marginTop: space.lg, paddingHorizontal: space.xl, gap: 6 },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 560 },
  nowText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text, letterSpacing: -0.2, flexShrink: 1 },
  fadeText: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.gold },
  topBar: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panel: {
    position: 'absolute',
    borderRadius: radius.xl,
    backgroundColor: 'rgba(12,12,14,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  panelBody: { padding: space.lg, gap: space.lg },
  cards: { gap: space.sm, paddingTop: space.sm },
  card: {
    width: 128,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(243,239,232,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(243,239,232,0.12)',
    gap: 4,
  },
  cardOn: { borderColor: 'rgba(226,168,75,0.7)', backgroundColor: 'rgba(226,168,75,0.12)' },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 22, marginBottom: 6 },
  cardLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text, letterSpacing: -0.2 },
  cardDetail: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.textMuted },
  eq: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 14 },
  eqBar: { width: 3, borderRadius: 1.5 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countdown: { fontFamily: fonts.mono, fontSize: 13, color: colors.gold, letterSpacing: 1, fontVariant: ['tabular-nums'] },
  chips: { gap: space.sm, paddingTop: space.sm },
  chip: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: radius.pill,
    justifyContent: 'center',
    backgroundColor: 'rgba(243,239,232,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(243,239,232,0.12)',
  },
  chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  chipTextOn: { color: colors.bg },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  creditsLink: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.textFaint },
  transport: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  glass: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18,18,22,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  glassPrimary: { backgroundColor: colors.text, borderColor: colors.text },
  creditsWrap: { alignItems: 'center', justifyContent: 'center', padding: space.xl, backgroundColor: 'rgba(5,5,6,0.55)' },
  credits: {
    width: '100%',
    maxWidth: 460,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(14,14,16,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  creditTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  creditDetail: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  hintRow: { position: 'absolute', alignItems: 'center' },
  hint: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
});
