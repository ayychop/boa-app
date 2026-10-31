import { Component, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { setStatusBarHidden } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  interpolateColor,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import useReducedMotion, { useWarm } from '../hooks/useReducedMotion';
import { usePlayer } from '../context/PlayerContext';
import { formatRemaining, useSleepRemaining, useSleepTimer } from '../context/SleepTimerContext';
import { useZen } from '../context/ZenContext';
import useNowPlaying from '../hooks/useNowPlaying';
import useBottomSpace from '../hooks/useBottomSpace';
import useLayout from '../hooks/useLayout';
import { podcastById } from '../data/podcasts';
import { categoryOf, MEDIA_HEADERS, SCENES, SLEEP_TIMERS, soundscapeById, ZEN_CATEGORIES } from '../data/sleep';
import useActiveAudio from '../hooks/useActiveAudio';
import * as ambientAudio from '../audio/ambient';
import { cachedSource, discard, sweep } from '../utils/mediaCache';
import { guarded, safely } from '../utils/safely';
import useScreenAwake from '../hooks/useScreenAwake';
import useSettled from '../hooks/useSettled';
import { hideNavBar, showNavBar } from '../utils/navBar';
import { addScreenListener } from '../../modules/boa-screen';
import { haptics } from '../utils/haptics';
import { shiftHex, withAlpha } from '../utils/color';
import { startLoop } from '../utils/loop';
import DriftingFog from '../components/DriftingFog';
import Grain from '../components/Grain';
import StationLogo from '../components/StationLogo';
import { PulseDot, Slate } from '../components/ui';
import { colors, fonts, radius, space } from '../theme';
import BoaLogo from '../components/BoaLogo';
import { LoadingDots } from '../components/Skeleton';
import Panel, { panelEntering } from '../components/Panel';
import { SaverBackdrop, ScreensaverPicker } from '../components/zen/Screensavers';
import { screensaverById, useScreensaver } from '../data/screensavers';

// Fades: slow and soft, like a room's lights dimming.
const DIM = Easing.bezier(0.33, 0, 0.2, 1);
// Under the video and photograph (and in their place if neither loads) the
// room glows in BOA's own amber.
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
// The screensaver's radio card, and what each tab is called on its button.
const RADIO_CARD = 72;
const WAKE_HINT = 'Tap anywhere to go home';

// Re-renders on the minute, not every second: the sweep under the clock
// shows the seconds, on the UI thread. A timer that was due while the screen
// was off or the app was away fires late (or not before the phone is picked
// up), so coming back to the app, or the screen lighting, brings the clock
// up to date at once and starts the next minute's timer from there.
function useMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let id;
    let alive = true;
    const schedule = () => {
      clearTimeout(id);
      const d = new Date();
      id = setTimeout(
        () => {
          if (!alive) return;
          setNow(new Date());
          schedule();
        },
        60000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 20,
      );
    };
    const catchUp = () => {
      if (!alive) return;
      setNow((prev) => {
        const next = new Date();
        return prev.getMinutes() === next.getMinutes() && next - prev < 60000 ? prev : next;
      });
      schedule();
    };
    schedule();
    const appSub = safely('clock app state', () => AppState.addEventListener('change', guarded('clock app state', (state) => state === 'active' && catchUp())));
    const screenOff = safely('clock screen listener', () => addScreenListener(guarded('clock screen', (state) => (state === 'on' || state === 'unlocked') && catchUp())));
    return () => {
      alive = false;
      clearTimeout(id);
      safely('clock app state remove', () => appSub?.remove());
      safely('clock screen listener remove', () => screenOff?.());
    };
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
      time: parts
        .filter((p) => p.type !== 'dayPeriod')
        .map((p) => p.value)
        .join('')
        .trim(),
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
function useAmbientAudio() {
  const [state, setState] = useState(ambientAudio.getState);
  useEffect(() => ambientAudio.subscribe(setState), []);
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
    <Animated.View style={[{ position: 'absolute', left: width * blob.x - BLOB / 2, top: height * blob.y - BLOB / 2, width: BLOB, height: BLOB }, style]}>
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

/** Four pools of amber drifting over each other on one UI-thread clock. */
function MeshGradient({ width, height, running }) {
  const reduceMotion = useReducedMotion();
  const clock = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion || !running) return;
    return startLoop(clock, MESH_LOOP, Easing.linear);
  }, [reduceMotion, running, clock]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {BLOBS.map((blob, i) => (
        <MeshBlob key={i} id={`zen-mesh-${i}`} clock={clock} blob={blob} color={shiftHex(HOUSE_TONE, ...blob.tone)} width={width} height={height} />
      ))}
    </View>
  );
}

/**
 * The scene's still photograph on a slow Ken Burns drift. It fades in once
 * it has loaded; until then (or if it can't) the amber mesh is the room.
 */
function ScenePhoto({ scene, width, height, running }) {
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(0);
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion || !running) return;
    return startLoop(drift, KEN_BURNS_MS, Easing.inOut(Easing.quad), true);
  }, [reduceMotion, running, drift]);
  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ scale: 1.08 + drift.value * 0.1 }, { translateX: (drift.value - 0.5) * width * 0.04 }, { translateY: (0.5 - drift.value) * height * 0.03 }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Image
        source={{ uri: scene.uri, headers: MEDIA_HEADERS }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        testID={`zen-scene-${scene.id}`}
        onLoad={() => {
          shown.value = withTiming(1, { duration: 1600, easing: DIM });
        }}
        onError={(e) => console.warn(`[zen] scene ${scene.id} failed to load`, e?.nativeEvent?.error)}
      />
    </Animated.View>
  );
}

// A short, stable name for an address (djb2, base 36).
function shortHash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Old downloads (before the cache moved files into place only once whole) are
// swept away once: any of them could be a half-written video.
const VIDEO_TAG = 'v2';
let swept = false;
const sweepOldVideos = () => {
  if (swept) return;
  swept = true;
  sweep('scenes', (name) => name.includes(`-${VIDEO_TAG}.`) && !name.endsWith('.part'));
};

/** Waits for the tab's own transition to finish before the video decoder starts. */
const VIDEO_DELAY_MS = 700;

/**
 * If a decorative layer can't be drawn (the video, the screensaver picker: a
 * native or decoder failure surfaced as a render error), it quietly drops
 * out and the rest stays: never the whole Zen page.
 */
class LayerBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.warn('[zen] a layer failed and was dropped', error?.message ?? error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// How long the video takes to fade in over the photograph, and how long the
// layers beneath it keep moving while it does (then they hold still: nothing
// under a full-screen video needs animating, and every frame saved is a
// smoother one).
const VIDEO_FADE_MS = 1800;
// The radio's play and pause tapped quickly never builds a decoder: the room
// only gets its video once the radio has stayed off this long.
const VIDEO_SETTLE_MS = 500;

/** The files a scene's video can be played from, best first. */
export function videoFiles(scene) {
  if (Platform.OS === 'ios') return [scene.video.ios];
  return [scene.video.uri, scene.video.fallback].filter(Boolean);
}

/**
 * Playback settings, one at a time and each guarded, so a property the
 * platform doesn't have can't stop the ones after it. The first three come
 * first: silent and mixing, the player never asks for the audio focus (which
 * would pause the radio or a soundscape). It never plays on in the
 * background and never holds the screen awake (Zen decides that itself, from
 * what is audibly playing).
 */
function configureVideoPlayer(p) {
  const set = (key, value) =>
    safely(`video ${key}`, () => {
      p[key] = value;
    });
  set('audioMixingMode', 'mixWithOthers');
  set('muted', true);
  set('volume', 0);
  set('loop', true);
  set('staysActiveInBackground', false);
  set('showNowPlayingNotification', false);
  set('keepScreenOnWhilePlaying', false);
  set('playbackRate', 1);
}

/**
 * The scene's looping video, muted and mixed with the app's audio (so it
 * never takes audio focus from a soundscape or the radio), played from the
 * cache. It fades in over the photograph on its first frame; it only plays
 * while the Zen tab is on screen. On a warm phone it still draws its first
 * frame (so the room isn't left without its picture) and then holds there.
 * It starts a moment after the tab opens, once the transition is over.
 *
 * Built to be thrown away at any instant: the screen going off, the app
 * leaving the front, a quick tap on the radio or a change of scene can each
 * unmount it while a download, a `replace` or a first frame is still in
 * flight. Every native call is guarded, everything that arrives late checks
 * it is still mounted, and a video the decoder refuses is dropped (and its
 * cached file deleted) so the photograph carries on and the next try starts
 * from a clean copy.
 */
function SceneVideo({ scene, running, onShown, height }) {
  const shown = useSharedValue(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const player = useVideoPlayer(null, (p) => safely('video player setup', () => configureVideoPlayer(p)));
  const [armed, setArmed] = useState(false);
  const [source, setSource] = useState(null);
  const [failed, setFailed] = useState(false);
  // Which file to play: the best one first (4K), then the step down if this
  // phone's decoder refuses it. Only the last refusal ends the video.
  const files = videoFiles(scene);
  const [tier, setTier] = useState(0);
  const tierRef = useRef(0);
  tierRef.current = tier;
  const lastTier = files.length - 1;
  const runningRef = useRef(running);
  runningRef.current = running;
  const framed = useRef(false);
  const cachedName = useRef(null);

  useEffect(() => {
    const id = setTimeout(() => setArmed(true), VIDEO_DELAY_MS);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!armed) return undefined;
    let live = true;
    sweepOldVideos();
    const uri = files[Math.min(tier, lastTier)];
    const ext = Platform.OS === 'ios' ? 'mov' : 'webm';
    // Named after the address too, so a new (sharper) video for a scene is
    // downloaded rather than the old cached one played.
    const name = `${scene.id}-${shortHash(uri)}-${VIDEO_TAG}.${ext}`;
    cachedName.current = name;
    cachedSource('scenes', name, uri)
      .then((s) => live && alive.current && setSource(s))
      .catch((err) => console.warn(`[zen] video ${scene.id} unavailable`, err?.message ?? err));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, scene, tier]);

  // A decoder that refuses the file: drop the video, keep the photograph,
  // and delete the cached copy so a bad download isn't replayed for ever.
  useEffect(() => {
    const sub = safely('video status listener', () =>
      player.addListener('statusChange', (e) => {
        if (e?.status !== 'error' || !alive.current) return;
        console.warn(`[zen] video ${scene.id} (file ${tierRef.current + 1} of ${lastTier + 1}) was refused by the decoder`, e?.error?.message ?? '');
        if (cachedName.current) discard('scenes', cachedName.current);
        if (tierRef.current < lastTier) {
          // Try the step down (a phone that can't decode 4K plays 1080p).
          setSource(null);
          setTier(tierRef.current + 1);
        } else {
          setFailed(true);
        }
      }),
    );
    return () => {
      safely('video status listener remove', () => sub?.remove?.());
    };
  }, [player, scene.id, lastTier]);

  useEffect(() => {
    if (!source || failed) return;
    framed.current = false;
    safely(`video ${scene.id} replace`, () => player.replace(source));
  }, [player, source, scene.id, failed]);

  useEffect(() => {
    if (!source || failed) return;
    // Held (warm phone): play until the first frame is up, which pauses it.
    safely(`video ${scene.id} play/pause`, () => {
      if (running || !framed.current) player.play();
      else player.pause();
    });
  }, [player, source, running, scene.id, failed]);

  // Once the fade has finished, whatever is beneath can stop moving.
  const coverTimer = useRef(null);
  useEffect(
    () => () => {
      clearTimeout(coverTimer.current);
      onShown?.(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const style = useAnimatedStyle(() => ({ opacity: shown.value }));
  if (failed) return null;
  // A clip with a frame baked into it (black bars, a border) is enlarged until
  // that is off screen (see SCENES.night).
  const frame = scene.video.frame;
  const cropped = frame ? { transform: [{ translateY: frame.shift * height }, { scale: frame.zoom }] } : null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, cropped, style]} testID={`zen-video-${scene.id}`}>
      <LayerBoundary>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
          allowsPictureInPicture={false}
          startsPictureInPictureAutomatically={false}
          allowsVideoFrameAnalysis={false}
          useExoShutter={false}
          // A TextureView, so the fade and the overlays above it composite
          // like any other view (a SurfaceView ignores parent opacity).
          surfaceType="textureView"
          onFirstFrameRender={() => {
            if (!alive.current) return;
            framed.current = true;
            shown.value = withTiming(1, { duration: VIDEO_FADE_MS, easing: DIM });
            clearTimeout(coverTimer.current);
            coverTimer.current = setTimeout(() => alive.current && onShown?.(true), VIDEO_FADE_MS + 100);
            if (!runningRef.current) safely(`video ${scene.id} hold`, () => player.pause());
          }}
        />
      </LayerBoundary>
    </Animated.View>
  );
}

// How long one scene fades into the next.
const SCENE_FADE_MS = 1400;

/**
 * One scene's photograph (and, on the newest layer, its video). The newest
 * layer fades in; one being replaced fades out while its photograph stays,
 * and its video is already gone, so two video players never run at once.
 * Plain opacity on the UI thread, with no layout-exit animation: a view
 * kept alive to animate its own removal is exactly what could still be
 * mid-flight when the tab is left.
 */
function SceneLayer({ scene, newest, width, height, running, withVideo, onCovered }) {
  const o = useSharedValue(0);
  // The video is up and opaque: the photograph under it holds still.
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    o.value = withTiming(newest ? 1 : 0, { duration: SCENE_FADE_MS, easing: DIM });
  }, [newest, o]);
  const showing = withVideo && newest;
  const cover = (on) => {
    setCovered(on);
    if (newest) onCovered?.(on);
  };
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <ScenePhoto scene={scene} width={width} height={height} running={running && !(covered && showing)} />
      {showing && <SceneVideo scene={scene} running={running} onShown={cover} height={height} />}
    </Animated.View>
  );
}

/** The scenes on screen: the current one, and the one it is replacing until that has faded. */
function SceneStack({ scene, width, height, running, withVideo, onCovered }) {
  const [layers, setLayers] = useState([scene]);
  useEffect(() => {
    setLayers((l) => (l[l.length - 1].id === scene.id ? l : [l[l.length - 1], scene]));
  }, [scene]);
  const settling = layers.length > 1;
  useEffect(() => {
    if (!settling) return undefined;
    const id = setTimeout(() => setLayers((l) => l.slice(-1)), SCENE_FADE_MS + 200);
    return () => clearTimeout(id);
  }, [settling, layers]);
  return (
    <>
      {layers.map((l, i) => (
        <SceneLayer key={l.id} scene={l} newest={i === layers.length - 1} width={width} height={height} running={running} withVideo={withVideo} onCovered={onCovered} />
      ))}
    </>
  );
}

/**
 * The room: amber mesh, the scene's photograph, its looping video over
 * that, drifting smoke, film grain, and a shade so text reads and the
 * screen stays dim enough to sleep by. As the screensaver the shade is a
 * single even veil: no darker band across the top or the foot.
 */
function Atmosphere({ sceneId, width, height, running, withVideo = true, ambient = false }) {
  const scene = SCENES[sceneId] ?? SCENES.night;
  // A full-screen video hides the amber mesh completely: it stops drawing.
  const [covered, setCovered] = useState(false);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <MeshGradient width={width} height={height} running={running && !(covered && withVideo)} />
      <SceneStack scene={scene} width={width} height={height} running={running} withVideo={withVideo} onCovered={setCovered} />
      <DriftingFog width={width} height={height} opacity={0.45} running={running} />
      <Grain width={width} height={height} opacity={0.05} running={running} />
      {ambient ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,5,6,0.3)' }]} testID="zen-veil" />
      ) : (
        <LinearGradient colors={['rgba(5,5,6,0.62)', 'rgba(5,5,6,0.36)', 'rgba(5,5,6,0.46)', 'rgba(5,5,6,0.9)']} locations={[0, 0.32, 0.6, 1]} style={StyleSheet.absoluteFill} />
      )}
    </View>
  );
}

// How often the sweep is redrawn: about 20 times a second is far more than its
// pace (a point or so every few hundred milliseconds) needs, and costs the UI
// thread next to nothing. A phone that is warm, or set to reduce motion, still
// shows the time passing, once a second: the sweep is the clock's seconds
// hand, not decoration, so it is never held still.
const SWEEP_STEP_MS = 50;
const SWEEP_CALM_STEP_MS = 1000;

/** How far through its minute a moment is (0 to 1): the sweep's whole truth. */
export function minuteFraction(ms) {
  'worklet';
  return (ms % 60000) / 60000;
}

// A gold hairline that fills across each minute, with a bright bead riding
// its leading edge. Its position is read from the wall clock on every frame
// (never counted from when it started), so it can't fall behind or freeze:
// a screen that dimmed, an app that was away, a timer that never fired or an
// animation the system cancelled can't stop it, and the next frame is right
// again. (A single one-minute timing, restarted by a timer, did stop: it sat
// at the end of its run when the timer was late, and held still outright on
// a phone that was warm or on Reduce Motion.)
function MinuteSweep({ width }) {
  const calm = useReducedMotion();
  const p = useSharedValue(minuteFraction(Date.now()));
  const last = useSharedValue(0);
  const step = calm ? SWEEP_CALM_STEP_MS : SWEEP_STEP_MS;
  useFrameCallback(() => {
    'worklet';
    const t = Date.now();
    if (t - last.value < step) return;
    last.value = t;
    p.value = minuteFraction(t);
  });
  // The minute turning is instant: the hairline empties as the clock rolls over.
  const fill = useAnimatedStyle(() => ({ width: p.value * width }));
  const bead = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * width - 3 }] }));
  return (
    <View pointerEvents="none" style={[styles.sweep, { width }]} testID="zen-sweep">
      <Animated.View style={[styles.sweepFill, fill]} />
      <Animated.View style={[styles.bead, bead]} />
    </View>
  );
}

// The digits as separate glyphs, so only the ones that change roll in.
function Digits({ time, size, lineHeight }) {
  return (
    <View style={styles.digits}>
      {time.split('').map((ch, i) => (
        <Animated.View key={`${i}-${ch}`} entering={FadeInDown.duration(700)}>
          {/* Tight tracking as a margin on both sides of each digit, not as
              negative letterSpacing: that trails after the last glyph and
              pushed the whole time a few points to the right. */}
          <Text style={[styles.clock, { fontSize: size, lineHeight, marginHorizontal: -size * 0.0175 }]}>{ch}</Text>
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
// the minute sweep below; the group drifts slowly so nothing burns in. On
// the screensaver (`signed`) a small, faint BOA wordmark sits under the
// sweep, like a maker's mark on a watch dial, and drifts with it.
function Clock({ width, height, compact, signed = false }) {
  // Only the screensaver wanders sideways (against burn-in). The Zen page keeps
  // its date and time dead centre and just breathes up and down.
  const sway = signed ? DRIFT : 0;
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
    return { transform: [{ translateX: Math.sin(a) * sway }, { translateY: Math.sin(a * 2) * DRIFT * 0.6 }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.clockGroup, driftStyle]}>
      {/* paddingLeft = the slate's letterSpacing, which trails the last letter. */}
      <Slate style={styles.dateSlate}>{dateLine(now)}</Slate>
      <View style={{ marginTop: space.sm }} accessibilityRole="timer" accessibilityLabel={`${time}${period ? ` ${period}` : ''}`} accessible>
        <Digits time={time} size={clockSize} lineHeight={lineHeight} />
        {period ? <Text style={[styles.period, { fontSize: Math.round(clockSize * 0.24), bottom: Math.round(lineHeight * 0.16) }]}>{period}</Text> : null}
      </View>
      <MinuteSweep width={Math.round(Math.min(clockSize * 1.8, width * 0.6))} />
      {signed ? (
        <View style={styles.mark} testID="zen-logo" accessibilityLabel="BOA Network" accessible>
          {/* A soft gold halo behind the wordmark, so it glows against the dark. */}
          <View pointerEvents="none" style={styles.markGlow} testID="zen-logo-glow" />
          <BoaLogo sheen height={Math.round(Math.max(24, Math.min(clockSize * 0.2, 44)))} color="#F5CE7E" />
        </View>
      ) : null}
    </Animated.View>
  );
}

// What's on: the soundscape and/or the radio, and when it fades out.
// With the radio card showing, the radio is left to it. On the screensaver
// (`onOpenSound`) the soundscape is a button into the full Zen page.
function NowLine({ sound, withRadio = true, withSound = true, onOpenSound }) {
  const { current, status, trackTitle } = usePlayer();
  const remaining = useSleepRemaining();
  const nowPlaying = useNowPlaying(current, current?.kind === 'radio');
  const podcast = current?.kind === 'podcast' ? podcastById(current.podcastId) : null;
  // A paused station isn't "on": only a playing one gets a line.
  const radioOn = status === 'playing' || status === 'loading';
  const radioLine = current && withRadio && radioOn ? [podcast ? podcast.title : current.name, podcast ? current.name : trackTitle || nowPlaying].filter(Boolean).join(' · ') : null;
  const scape = withSound && sound.id && sound.status !== 'idle' ? soundscapeById(sound.id) : null;
  const kind = scape ? categoryOf(scape.id) : null;
  const soundLine = scape ? `${kind.label} · ${scape.label}` : null;
  const asButton = !!onOpenSound && !!scape;
  const lines = [asButton ? null : soundLine, radioLine].filter(Boolean);
  if (!lines.length && !remaining && !asButton) return null;
  return (
    <View pointerEvents="box-none" style={styles.nowLine}>
      {asButton && (
        <Pressable
          onPress={() => {
            haptics.selection();
            onOpenSound();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${kind.label}, ${scape.label}. Open Zen`}
          testID="zen-screensaver-sound"
          style={({ pressed }) => [styles.soundChip, styles.soundChipBare, pressed && { transform: [{ scale: 0.96 }], opacity: 0.85 }]}
        >
          <Ionicons name={kind.icon} size={16} color={colors.text} />
          <Text style={styles.nowText} numberOfLines={1}>
            {soundLine}
          </Text>
          {sound.status === 'playing' ? <Equalizer color={colors.live} /> : null}
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </Pressable>
      )}
      {lines.length > 0 && (
        <View style={styles.nowRow}>
          <PulseDot color={(withRadio && status === 'playing') || sound.status === 'playing' ? colors.live : colors.gold} size={7} />
          <Text style={[styles.nowText, styles.nowTextCentred]} numberOfLines={1}>
            {lines.join('  +  ')}
          </Text>
          {/* As wide as the dot, so the words (not dot plus words) are what's centred. */}
          <View style={{ width: 7 }} />
        </View>
      )}
      {remaining ? <Text style={styles.fadeText}>Fades out in {formatRemaining(remaining)}</Text> : null}
    </View>
  );
}

// Frosted round control.
function GlassButton({ icon, label, onPress, size = 48, primary, children }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.glass, { width: size, height: size, borderRadius: size / 2 }, primary && styles.glassPrimary, pressed && { transform: [{ scale: 0.92 }] }]}
    >
      {children ?? <Ionicons name={icon} size={Math.round(size * 0.42)} color={primary ? colors.bg : colors.text} />}
    </Pressable>
  );
}

// One kind of sound, in its own colour (Rain deep blue, Deep sleep violet,
// Frequencies gold, Nature firelight). Tap to play its sound (the one last
// chosen there, else its first); tap again to pause. While one of its
// sounds is on, the card names that sound. It glows up into its colour
// when it's on, on the UI thread.
function KindCard({ kind, state, index = 0 }) {
  const calm = useReducedMotion();
  const current = state.id ? soundscapeById(state.id) : null;
  const mine = current?.category === kind.id ? current : null;
  const on = !!mine && (state.status === 'playing' || state.status === 'loading');
  const loading = !!mine && state.status === 'loading';
  const failed = !!mine && state.status === 'error';
  const paused = !!mine && state.status === 'paused';
  const tone = kind.tone;
  const lit = useSharedValue(on ? 1 : 0);
  const press = useSharedValue(1);
  useEffect(() => {
    lit.value = withTiming(on ? 1 : 0, { duration: 520, easing: DIM });
  }, [on, lit]);
  // Worked out here, on the JS thread; the worklet only blends them.
  const fills = [withAlpha(tone, 0.12), withAlpha(tone, 0.42)];
  const edges = [withAlpha(tone, 0.28), withAlpha(tone, 0.95)];
  const frame = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(lit.value, [0, 1], fills),
    borderColor: interpolateColor(lit.value, [0, 1], edges),
    transform: [{ scale: press.value }],
  }));
  const ink = on ? '#FFFFFF' : colors.text;
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        ambientAudio.toggleCategory(kind.id);
      }}
      onPressIn={() => {
        press.value = withTiming(0.95, { duration: 90 });
      }}
      onPressOut={() => {
        press.value = withSpring(1, { duration: 380, dampingRatio: 0.55 });
      }}
      accessibilityRole="button"
      accessibilityLabel={`${on ? 'Pause' : 'Play'} ${kind.label}`}
      accessibilityHint={mine ? `${mine.label}` : undefined}
      accessibilityState={{ selected: on }}
      testID={`soundscape-${kind.id}`}
    >
      <Animated.View entering={panelEntering(index, calm)} style={[styles.card, frame]}>
        <View style={styles.cardTop}>
          <Ionicons name={kind.icon} size={20} color={on ? '#FFFFFF' : tone} />
          {loading ? <LoadingDots color="#FFFFFF" size={5} /> : on ? <Equalizer color="#FFFFFF" /> : null}
        </View>
        <Text style={[styles.cardLabel, { color: ink }]} numberOfLines={1} testID={`soundscape-${kind.id}-label`}>
          {mine ? mine.label : kind.label}
        </Text>
        <Text style={[styles.cardDetail, on && { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={1}>
          {failed ? "Couldn't load. Tap to retry" : mine ? `${kind.label}${paused ? ' · Paused' : ''}` : `${kind.sounds.length} sounds`}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// The six sounds of the kind that's on, to switch between with one tap.
function SoundChoices({ state }) {
  const kind = state.id ? categoryOf(state.id) : null;
  if (!kind) return null;
  return (
    <Animated.View entering={FadeIn.duration(260)} testID={`zen-sounds-${kind.id}`}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {kind.sounds.map((sound) => {
          const on = state.id === sound.id;
          return (
            <Pressable
              hitSlop={{ top: 5, bottom: 5 }}
              key={sound.id}
              onPress={() => {
                haptics.selection();
                if (!on || state.status !== 'playing') ambientAudio.play(sound.id);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${sound.label}`}
              accessibilityHint={sound.detail}
              accessibilityState={{ selected: on }}
              testID={`zen-sound-${sound.id}`}
              style={({ pressed }) => [styles.chip, on && { backgroundColor: kind.tone, borderColor: kind.tone }, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.chipText, on && { color: '#FFFFFF' }]}>{sound.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Animated.View>
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
              hitSlop={{ top: 5, bottom: 5 }}
              key={m ?? 'off'}
              onPress={() => pick(m)}
              accessibilityRole="button"
              accessibilityLabel={m == null ? 'No fade-out timer' : `Fade out in ${m} minutes`}
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{m == null ? 'Off' : m < 60 ? `${m} min` : m === 60 ? '1 hr' : `${m / 60} hr`}</Text>
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
        {status === 'loading' ? <LoadingDots color={colors.bg} /> : <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color={colors.bg} style={isPlaying ? null : { marginLeft: 2 }} />}
      </GlassButton>
      {canStep && <GlassButton icon="play-skip-forward" label="Next station" onPress={next} size={40} />}
    </View>
  );
}

/**
 * The screensaver's media controls for the radio: the station, what's on (or
 * that it is paused), and its controls, so the radio can be paused, played
 * again or changed without waking Zen. On every screensaver, playing or not.
 */
function RadioCard({ bare = false }) {
  const { current, trackTitle, status } = usePlayer();
  const radioOn = status === 'playing' || status === 'loading';
  const nowPlaying = useNowPlaying(current, radioOn && current?.kind === 'radio');
  const podcast = current?.kind === 'podcast' ? podcastById(current.podcastId) : null;
  const title = podcast ? podcast.title : current.name;
  const detail = !radioOn ? 'Paused' : podcast ? current.name : trackTitle || nowPlaying || 'Live on BOA Radio';
  return (
    <View style={[styles.radioCard, bare && styles.radioCardBare]} testID="zen-radio-info">
      {current.kind === 'radio' ? <StationLogo station={current} size={44} rounded={22} fit="cover" /> : null}
      <View style={styles.radioText} accessible accessibilityLabel={`${title}, ${detail}`}>
        <Text style={styles.radioTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.radioDetail} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <Transport />
    </View>
  );
}

/**
 * The same controls for a soundscape, when there is no radio loaded: what is
 * on, and play or pause. Its name is also the way into the full Zen page.
 */
function SoundCard({ sound, onOpen, bare = false }) {
  const scape = soundscapeById(sound.id);
  if (!scape) return null;
  const kind = categoryOf(scape.id);
  const on = sound.status === 'playing' || sound.status === 'loading';
  return (
    <View style={[styles.radioCard, bare && styles.radioCardBare]} testID="zen-sound-info">
      <View style={styles.soundIcon}>
        <Ionicons name={kind.icon} size={22} color={colors.text} />
      </View>
      <Pressable
        onPress={() => {
          haptics.selection();
          onOpen();
        }}
        hitSlop={8}
        style={styles.radioText}
        accessibilityRole="button"
        accessibilityLabel={`${kind.label}, ${scape.label}, ${on ? 'playing' : 'paused'}. Open Zen`}
        testID="zen-screensaver-sound"
      >
        <Text style={styles.radioTitle} numberOfLines={1}>
          {scape.label}
        </Text>
        <Text style={styles.radioDetail} numberOfLines={1}>
          {kind.label} · {on ? 'Playing' : 'Paused'}
        </Text>
      </Pressable>
      <View style={styles.transport}>
        <GlassButton
          label={on ? `Pause ${scape.label}` : `Play ${scape.label}`}
          onPress={() => {
            haptics.selection();
            ambientAudio.toggle(scape.id);
          }}
          size={48}
          primary
        >
          {sound.status === 'loading' ? <LoadingDots color={colors.bg} /> : <Ionicons name={on ? 'pause' : 'play'} size={20} color={colors.bg} style={on ? null : { marginLeft: 2 }} />}
        </GlassButton>
      </View>
    </View>
  );
}

/**
 * The Zen tab: a Sleep & Meditation Hub. With its controls: the room (a
 * looping video scene over a photograph), the clock, soundscapes, the
 * fade-out timer and radio controls (the credits live in Profile). As the
 * screensaver (after the screen turns off, by the power button or by timing
 * out): the room, the clock, what's playing and, while the radio plays, the
 * radio with its controls; the tab bar and status bar are hidden. A tap, or
 * Back, wakes it: back to the tab it was opened from, or to the controls if
 * it was opened on Zen. It is an ordinary tab screen, so nothing ever sits
 * over the app.
 */
function ZenRoom() {
  const { width, height } = useLayout();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const focused = useIsFocused();
  const { ambient, wake } = useZen();
  const sound = useAmbientAudio();
  const saver = useScreensaver();
  const saverDef = screensaverById(saver);
  const active = useActiveAudio();
  const { current, isPlaying } = usePlayer();
  const bottomSpace = useBottomSpace(space.md);
  const hint = useSharedValue(0);

  // The media controls: while there is something to control (a station or
  // an episode loaded, playing or paused, or a soundscape), they sit on the
  // screensaver, whichever screensaver it is: the whole point is to pause or
  // change what's on without leaving it. Nothing loaded, nothing shown.
  const soundLoaded = !!sound.id && sound.status !== 'idle';

  // Back wakes the screensaver, like a tap, instead of leaving the app.
  useEffect(() => {
    if (!focused || !ambient) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      wake({ toHome: true });
      return true;
    });
    return () => sub.remove();
  }, [focused, ambient, wake]);

  useEffect(() => {
    hint.value = ambient ? withDelay(1400, withSequence(withTiming(1, { duration: 1200 }), withDelay(5000, withTiming(0.35, { duration: 1500 })))) : withTiming(0, { duration: 200 });
    return () => cancelAnimation(hint);
  }, [ambient, hint]);

  // The screensaver hides the status bar.
  useEffect(() => {
    if (!focused || !ambient) return;
    try {
      setStatusBarHidden(true, 'fade');
    } catch {}
    return () => {
      try {
        setStatusBarHidden(false, 'fade');
      } catch {}
    };
  }, [focused, ambient]);

  // While anything plays on this tab, the screen stays on like a bedside
  // display; with nothing playing the phone sleeps as it normally would.
  const audible = focused && (isPlaying || sound.status === 'playing');
  useEffect(() => {
    if (!audible) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      try {
        deactivateKeepAwake(KEEP_AWAKE_TAG);
      } catch {}
    };
  }, [audible]);

  const hintStyle = useAnimatedStyle(() => ({ opacity: hint.value }));

  // Every soundscape downloads quietly once you're here, so the next tap
  // plays from the phone.
  useEffect(() => {
    if (focused) ambientAudio.warmUp();
  }, [focused]);

  const sceneId = soundscapeById(sound.id)?.scene ?? 'night';
  // The room only moves while you're here and the radio is off: when the
  // radio takes over, every layer (mesh, photo, video, smoke, grain)
  // freezes where it is, and carries on from there once the radio stops.
  // The one addition: it also holds still while the phone runs warm. Nothing
  // else about the default room has changed.
  const warm = useWarm();
  const roomMoving = focused && !isPlaying && !warm;
  // The video decoder only exists while someone can see it: the app is in
  // front, the screen is lit, this tab is up, the radio is off, and all of
  // that has held for a moment. Pressing the power button, switching apps or
  // tapping the radio's play and pause quickly tears it down (or never builds
  // it); it is never started for a screen that is off.
  const awake = useScreenAwake();
  const videoOk = useSettled(focused && awake && !isPlaying, VIDEO_SETTLE_MS);

  // The screensaver is the whole screen: the system navigation bar (the three
  // buttons or the gesture pill, on a dark translucent scrim) is hidden while
  // it is up, and comes back the moment the screensaver ends, the tab is left
  // or this screen unmounts. Android can bring the bar back by itself when
  // the screen has been off or the app has been away, so it is asked again
  // each time the screen is awake once more. Never throws.
  useEffect(() => {
    if (!focused || !ambient) return undefined;
    hideNavBar();
    return () => {
      showNavBar();
    };
  }, [focused, ambient]);
  useEffect(() => {
    if (focused && ambient && awake) hideNavBar();
  }, [focused, ambient, awake]);
  const short = height < 500;
  const top = Math.max(insets.top, space.lg);
  // Controls sit above the tab bar (and mini player); the screensaver has
  // neither, so it only keeps clear of the system bars.
  const bottom = ambient ? Math.max(insets.bottom, space.lg) : bottomSpace;
  const edge = { left: space.xl, right: space.xl };
  const panelBeside = !ambient && short;
  const radioCard = ambient && !!current;
  const soundCard = ambient && !radioCard && soundLoaded;
  // Tall enough for the soundscapes, the timer and the radio's controls
  // without scrolling.
  const panelHeight = short ? 0 : sound.id ? 460 : 400;
  const clockArea = {
    top: top + (ambient ? 0 : 56),
    // The screensaver centres the clock and the mark on the screen itself:
    // the same room above and below (the radio line floats over the foot).
    bottom: ambient ? Math.max(top, short && (radioCard || soundCard) ? bottom + RADIO_CARD : 0) : panelBeside ? bottom : bottom + panelHeight + space.md,
    left: 0,
    right: panelBeside ? width / 2 : 0,
  };
  const clockW = width - clockArea.left - clockArea.right;
  const clockH = Math.max(120, height - clockArea.top - clockArea.bottom);

  return (
    <View style={styles.screen} testID={ambient ? 'zen-screensaver' : 'zen-screen'}>
      {/* With the radio on, the room is a still photograph: no video
          player exists at all, so opening Zen can never take the audio
          focus from the radio (Android pauses whatever loses it). */}
      {ambient && saverDef.generative ? (
        <SaverBackdrop id={saver} width={width} height={height} running={roomMoving} />
      ) : (
        <Atmosphere sceneId={(ambient && saverDef.scene) || sceneId} width={width} height={height} running={roomMoving} withVideo={videoOk} ambient={ambient} />
      )}
      {ambient && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => wake({ toHome: true })}
          accessibilityRole="button"
          accessibilityLabel="Go to Home"
          accessibilityHint="Closes the screensaver and opens the Home tab"
        />
      )}

      {/* Over the wake tap: the soundscape's button takes you into Zen. */}
      <View pointerEvents="box-none" style={[styles.clockArea, clockArea]}>
        <Clock width={clockW} height={clockH} compact={short} signed={ambient} />
        <NowLine sound={sound} withRadio={!radioCard} withSound={!soundCard} onOpenSound={ambient ? () => wake({ toControls: true }) : undefined} />
      </View>

      {/* The controls only exist outside the screensaver, so screen readers
          never land on invisible buttons. They fade in and out. */}
      {!ambient && (
        <Animated.View entering={FadeIn.duration(reduceMotion ? 150 : 450)} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View style={[styles.topBar, edge, { top }]} pointerEvents="box-none">
            <Slate dot color={colors.text}>
              Sleep & Meditation
            </Slate>
          </View>
          <Panel
            pointerEvents="box-none"
            testID="zen-panel"
            style={[styles.panel, panelBeside ? { top: top + 48, bottom, right: space.lg, width: width / 2 - space.xl } : { left: space.lg, right: space.lg, bottom, maxHeight: panelHeight }]}
          >
            <ScrollView contentContainerStyle={styles.panelBody} showsVerticalScrollIndicator={false}>
              {/* The radio's controls share the top row, so they are always
                  in view. */}
              <View style={styles.panelHead}>
                <Slate>Soundscapes</Slate>
                {/* The radio's controls, only while the radio is what's on. */}
                {active.kind === 'radio' && <Transport />}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
                {ZEN_CATEGORIES.map((k, i) => (
                  <KindCard key={k.id} kind={k} state={sound} index={i + 1} />
                ))}
              </ScrollView>
              <SoundChoices state={sound} />
              <TimerRow />
              <View>
                <Slate>Screensaver</Slate>
                <LayerBoundary>
                  <ScreensaverPicker />
                </LayerBoundary>
              </View>
            </ScrollView>
          </Panel>
        </Animated.View>
      )}

      {/* Over the wake tap, so its buttons work the radio instead. */}
      {(radioCard || soundCard) && (
        <Animated.View
          entering={FadeIn.duration(reduceMotion ? 150 : 600)}
          pointerEvents="box-none"
          style={[styles.radioRow, edge, { bottom: bottom + (short ? 0 : 40) }]}
          testID="zen-media-controls"
        >
          {radioCard ? <RadioCard bare /> : <SoundCard sound={sound} bare onOpen={() => wake({ toControls: true })} />}
        </Animated.View>
      )}

      {ambient && !short && (
        <View pointerEvents="none" style={[styles.hintRow, edge, { bottom: bottom + space.md }]}>
          <Animated.Text style={[styles.hint, hintStyle]}>{WAKE_HINT}</Animated.Text>
        </View>
      )}
    </View>
  );
}

/**
 * If any part of the room fails to draw, the Zen tab shows a short message
 * and a way to try again; the tab bar and the rest of the app carry on.
 */
class ZenBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    console.warn('[zen] the Zen screen failed to draw:', error?.message ?? error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={[styles.screen, styles.fallback]} testID="zen-fallback">
        <Slate dot>Sleep & Meditation</Slate>
        <Text style={styles.fallbackTitle}>Zen couldn't load just now.</Text>
        <Text style={styles.fallbackBody} numberOfLines={3}>
          {String(this.state.error?.message ?? this.state.error)}
        </Text>
        <Pressable hitSlop={8} onPress={() => this.setState({ error: null })} accessibilityRole="button" style={({ pressed }) => [styles.retry, pressed && { opacity: 0.8 }]}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

/**
 * The room only exists while the Zen tab is on screen. Leaving the tab
 * unmounts all of it (every loop, the video player, the clock), so nothing
 * of Zen keeps animating behind another tab; coming back builds it fresh.
 * (The tab isn't frozen on blur, so this unmount actually happens.)
 */
export default function ZenScreen() {
  const focused = useIsFocused();
  const { ambient, wake } = useZen();

  // Leaving the tab ends the screensaver, so coming back shows controls.
  const wasFocused = useRef(focused);
  useEffect(() => {
    if (wasFocused.current && !focused && ambient) wake();
    wasFocused.current = focused;
  }, [focused, ambient, wake]);

  if (!focused) return <View style={styles.screen} testID="zen-unmounted" />;
  return (
    <ZenBoundary>
      <ZenRoom />
    </ZenBoundary>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  fallback: { alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
  fallbackTitle: { fontFamily: fonts.semibold, fontSize: 20, color: colors.text, textAlign: 'center' },
  fallbackBody: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  retry: { marginTop: space.sm, paddingHorizontal: space.xl, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.text },
  retryText: { fontFamily: fonts.semibold, color: colors.bg },
  clockArea: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  clockGroup: { alignItems: 'center' },
  dateSlate: { paddingLeft: 2.3 },
  digits: { flexDirection: 'row', justifyContent: 'center' },
  clock: { fontFamily: fonts.extralight, color: colors.text, fontVariant: ['tabular-nums'], textAlign: 'center' },
  period: { position: 'absolute', left: '100%', marginLeft: space.sm, fontFamily: fonts.serif, color: colors.gold },
  // Faint enough to read as part of the dial, not a logo on top of it, but
  // lifted a touch so the mark is legible against a bright screensaver.
  // The signature under the clock: bright brushed gold with a halo, readable
  // across a room but still a signature (the clock stays the loudest thing).
  mark: { marginTop: space.xl, opacity: 0.96, alignItems: 'center', justifyContent: 'center' },
  markGlow: { position: 'absolute', width: '135%', height: '240%', borderRadius: 999, backgroundColor: 'rgba(245,206,126,0.1)', boxShadow: '0 0 36px 14px rgba(245,206,126,0.22)' },
  sweep: { height: 2, marginTop: space.md, borderRadius: 1, backgroundColor: 'rgba(243,239,232,0.12)', justifyContent: 'center' },
  sweepFill: { position: 'absolute', left: 0, height: 2, borderRadius: 1, backgroundColor: 'rgba(226,168,75,0.75)' },
  bead: { position: 'absolute', left: 0, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gold },
  nowLine: { alignItems: 'center', marginTop: space.lg, paddingHorizontal: space.xl, gap: 6 },
  soundChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 560,
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(12,12,14,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  // On the screensaver the sound button is just its words and icon: no dark
  // pill behind it (that read as a black bar across the screen).
  soundChipBare: { backgroundColor: 'transparent', borderWidth: 0 },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 560 },
  nowText: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.text, letterSpacing: -0.2, flexShrink: 1 },
  nowTextCentred: { textAlign: 'center' },
  fadeText: { fontFamily: fonts.mono, fontSize: 11, lineHeight: 16, paddingLeft: 1.6, textAlign: 'center', letterSpacing: 1.6, textTransform: 'uppercase', color: colors.gold },
  topBar: { position: 'absolute', flexDirection: 'row', alignItems: 'center', height: 44 },
  panel: {
    position: 'absolute',
    borderRadius: radius.xl,
    backgroundColor: 'rgba(12,12,14,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  panelBody: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg, gap: space.md },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  cards: { gap: space.sm },
  card: {
    width: 132,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 4,
  },
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
  chipText: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.text },
  chipTextOn: { color: colors.bg },
  transport: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  glass: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18,18,22,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  glassPrimary: { backgroundColor: colors.text, borderColor: colors.text },
  radioRow: { position: 'absolute', alignItems: 'center' },
  radioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    height: RADIO_CARD,
    width: '100%',
    maxWidth: 480,
    paddingLeft: space.md,
    paddingRight: space.md,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(12,12,14,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  // No plate on the screensaver: the station sits straight on the room.
  radioCardBare: { backgroundColor: 'transparent', borderWidth: 0 },
  radioText: { flex: 1, gap: 2, justifyContent: 'center' },
  soundIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(243,239,232,0.1)' },
  radioTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text, letterSpacing: -0.2 },
  radioDetail: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.textMuted },
  hintRow: { position: 'absolute', alignItems: 'center' },
  hint: { fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 2, textTransform: 'uppercase', color: colors.textFaint },
});
