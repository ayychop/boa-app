import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { cancelAnimation, Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import Grain from '../Grain';
import VibeTexture from './VibeTexture';
import { startLoop } from '../../utils/loop';
import { vibeById } from '../../chat/vibes';

/**
 * Layer 1 of the chat: the full-screen backdrop. It sits at the very back of
 * the thread (zIndex 0), outside the keyboard's reach, and nothing above it
 * paints a fill of its own, so whatever it draws is what shows between the
 * bubbles. Bottom to top:
 *
 *   mesh      the vibe's three-tone diagonal gradient (native, free)
 *   glows     its soft lights, drifting on their own slow loops
 *   texture   the vibe's pattern (gold weave, scanlines, film...)
 *   scene     turntable, stars, embers or rain
 *   vignette  darker top and bottom, so the header and composer sit on shade
 *   grain     fine film grain
 *
 * Performance: everything that moves moves by transform or opacity on the
 * UI thread (Reanimated), never by layout or React state, so the JS thread
 * is idle while it plays. Android draws every <Svg> into a bitmap its own
 * size, so the glows are 96pt gradients scaled up by transform (a few KB
 * each, where a screen-sized SVG was tens of MB), and the record is drawn
 * at half size. Every particle reads one shared clock. With `motion` off,
 * reduced motion on, or `paused` (the thread off screen), every loop stops
 * where it is and the scene holds still: no frames drawn, no battery spent.
 */

const GLOW = 96;
const hexA = (hex, a) => {
  const n = parseInt(String(hex).slice(1, 7), 16);
  return Number.isNaN(n) ? `rgba(255,255,255,${a})` : `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// A seeded scatter, so particles sit in the same places every time.
const seeded = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const SWAY = Easing.inOut(Easing.sin);

/** A 0..1 loop on the UI thread that holds still while `still`. */
function useLoop(ms, still, easing = SWAY, reverse = true) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (still) return undefined;
    return startLoop(t, ms, easing, reverse);
  }, [t, ms, still, easing, reverse]);
  return t;
}

// ------------------------------------------------------------------ glows

function Glow({ light, width, height, still }) {
  const t = useLoop(light.ms, still);
  const size = Math.round(width * light.size);
  const k = size / GLOW;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 1], light.opacity),
    transform: [
      { translateX: interpolate(t.value, [0, 1], light.x) * width - size / 2 },
      { translateY: interpolate(t.value, [0, 1], light.y) * height - size / 2 },
      { scale: interpolate(t.value, [0, 1], [1, 1.12]) },
    ],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.glow, { width: size, height: size }, style]} testID={`chat-glow-${light.id}`}>
      <Svg width={GLOW} height={GLOW} style={{ position: 'absolute', left: (size - GLOW) / 2, top: (size - GLOW) / 2, transform: [{ scale: k }] }}>
        <Defs>
          <RadialGradient id={`g-${light.id}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={light.color} stopOpacity={0.85} />
            <Stop offset="0.45" stopColor={light.color} stopOpacity={0.3} />
            <Stop offset="1" stopColor={light.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={GLOW} height={GLOW} fill={`url(#g-${light.id})`} />
      </Svg>
    </Animated.View>
  );
}

// -------------------------------------------------------------- turntable

const RECORD_MS = 9000;

/**
 * A deck under the chat: the platter's lit rim, a record with fine grooves
 * and a BOA label turning on it, and the tonearm resting in the groove.
 * Half off the bottom right, dim enough to stay behind the words.
 */
function Turntable({ width, height, accent, still }) {
  const r = width * 0.72;
  const size = r * 2;
  const left = width * 0.8 - r;
  const top = height * 0.72 - r;
  const turn = useLoop(RECORD_MS, still, Easing.linear, false);
  const breathe = useLoop(4200, still);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  const rim = useAnimatedStyle(() => ({ opacity: 0.35 + breathe.value * 0.35 }));
  const grooves = [];
  for (let g = r * 0.38; g < r * 0.94; g += Math.max(3, r / 40)) grooves.push(g);
  // Drawn at half size and scaled up: a quarter of the bitmap, still soft enough for a backdrop.
  const half = { position: 'absolute', left: size / 4, top: size / 4, transform: [{ scale: 2 }] };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="chat-turntable">
      {/* The platter's rim, catching the vibe's light. */}
      <Animated.View style={[{ position: 'absolute', left: left - 6, top: top - 6, width: size + 12, height: size + 12, borderRadius: r + 6, borderWidth: 2, borderColor: hexA(accent, 0.55) }, rim]} />
      <Animated.View style={[{ position: 'absolute', left, top, width: size, height: size }, spin]} testID="chat-turntable-record">
        <Svg width={size / 2} height={size / 2} viewBox={`0 0 ${size} ${size}`} style={half}>
          <Circle cx={r} cy={r} r={r} fill="#0A0908" opacity={0.92} />
          <G stroke="#FFFFFF" strokeOpacity={0.05} fill="none">
            {grooves.map((g) => (
              <Circle key={g} cx={r} cy={r} r={g} strokeWidth={1.2} />
            ))}
          </G>
          {/* Two sheens across the vinyl: they turn with it, so you see it spin. */}
          <Path d={`M ${r} ${r} L ${r + r * 0.95} ${r - r * 0.3} A ${r * 0.95} ${r * 0.95} 0 0 1 ${r + r * 0.95} ${r + r * 0.3} Z`} fill="#FFFFFF" opacity={0.05} />
          <Path d={`M ${r} ${r} L ${r - r * 0.95} ${r + r * 0.3} A ${r * 0.95} ${r * 0.95} 0 0 1 ${r - r * 0.95} ${r - r * 0.3} Z`} fill="#FFFFFF" opacity={0.04} />
          <Circle cx={r} cy={r} r={r * 0.3} fill={accent} opacity={0.85} />
          <Circle cx={r} cy={r} r={r * 0.3} fill="none" stroke="#000000" strokeOpacity={0.35} strokeWidth={r * 0.02} />
          <Line x1={r - r * 0.16} y1={r} x2={r + r * 0.16} y2={r} stroke="#000000" strokeOpacity={0.4} strokeWidth={r * 0.025} />
          <Circle cx={r} cy={r} r={r * 0.035} fill="#0A0908" />
        </Svg>
      </Animated.View>
      {/* The tonearm: still, resting on the outer grooves. */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <G opacity={0.5}>
          <Circle cx={width * 0.94} cy={height * 0.42} r={14} fill={hexA(accent, 0.25)} stroke={hexA(accent, 0.7)} strokeWidth={1.5} />
          <Line x1={width * 0.94} y1={height * 0.42} x2={width * 0.66} y2={height * 0.55} stroke="#D8D2C4" strokeWidth={4} strokeLinecap="round" />
          <Rect x={width * 0.66 - 9} y={height * 0.55 - 6} width={18} height={12} rx={2} fill="#D8D2C4" />
        </G>
      </Svg>
    </View>
  );
}

// -------------------------------------------------------------- particles

// One clock for every particle: a 60 second lap. Speeds are whole laps per
// clock lap, so each particle is exactly where it started when the clock
// wraps and there's never a jump.
const CLOCK_MS = 60000;
const frac = (v) => {
  'worklet';
  return v - Math.floor(v);
};

const PARTICLES = {
  // Points of light that twinkle in place.
  stars: { count: 40, make: (i) => ({ x: seeded(i + 1), y: seeded(i + 101), size: 1 + Math.round(seeded(i + 201) * 2), speed: 6 + Math.floor(seeded(i + 301) * 6), phase: seeded(i + 401) }) },
  // Dust in the light, rising slowly and swaying.
  embers: { count: 22, make: (i) => ({ x: seeded(i + 11), y: seeded(i + 111), size: 2 + Math.round(seeded(i + 211) * 2.5), speed: 1 + Math.floor(seeded(i + 311) * 3), phase: seeded(i + 411) }) },
  // Thin streaks falling at a slant: rain under the streetlights.
  rain: { count: 26, make: (i) => ({ x: seeded(i + 21), y: seeded(i + 121), size: 10 + Math.round(seeded(i + 221) * 14), speed: 22 + Math.floor(seeded(i + 321) * 12), phase: seeded(i + 421) }) },
};
export const particlesOf = (kind) => (PARTICLES[kind] ? Array.from({ length: PARTICLES[kind].count }, (_, i) => PARTICLES[kind].make(i)) : []);

function Particle({ p, kind, clock, width, height, color }) {
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    if (kind === 'stars') {
      const tw = 0.5 + 0.5 * Math.sin((t * p.speed + p.phase) * Math.PI * 2);
      return { opacity: 0.15 + tw * 0.75, transform: [{ translateX: p.x * width }, { translateY: p.y * height }] };
    }
    if (kind === 'embers') {
      const y = frac(p.y - t * p.speed);
      const sway = Math.sin((t * p.speed * 3 + p.phase) * Math.PI * 2) * 14;
      // Fade in from the bottom and out near the top.
      const o = Math.min(1, (1 - y) * 4, y * 3);
      return { opacity: o * 0.7, transform: [{ translateX: p.x * width + sway }, { translateY: y * height }] };
    }
    const y = frac(p.y + t * p.speed);
    return { opacity: 0.4, transform: [{ translateX: frac(p.x - t * p.speed * 0.12) * width }, { translateY: y * (height + 40) - 40 }, { rotate: '12deg' }] };
  });
  const shape = kind === 'rain' ? { width: 1.2, height: p.size, borderRadius: 1 } : { width: p.size, height: p.size, borderRadius: p.size };
  const glow = kind === 'embers' ? { boxShadow: `0px 0px 6px ${hexA(color, 0.9)}` } : null;
  return <Animated.View style={[styles.particle, shape, { backgroundColor: kind === 'stars' ? '#F2F4FF' : color }, glow, style]} />;
}

function Particles({ kind, width, height, color, still }) {
  const clock = useSharedValue(0);
  useEffect(() => {
    if (still) return undefined;
    // Carry on from where it stopped, finish that lap, then loop.
    return startLoop(clock, CLOCK_MS, Easing.linear);
  }, [clock, still]);
  const list = particlesOf(kind);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`chat-particles-${kind}`}>
      {list.map((p, i) => (
        <Particle key={i} p={p} kind={kind} clock={clock} width={width} height={height} color={color} />
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ scene

/** One vibe's whole backdrop. */
function Scene({ vibe, width, height, still }) {
  const shade = vibe.light ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.55)';
  // The record is drawn by the scene, so the texture doesn't draw it again.
  const texture = vibe.texture && vibe.texture !== 'vinyl' ? vibe : null;
  return (
    <>
      <LinearGradient colors={vibe.mesh} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} testID={`chat-mesh-${vibe.id}`} />
      {vibe.lights.map((l) => (
        <Glow key={l.id} light={l} width={width} height={height} still={still} />
      ))}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: vibe.veil }]} />
      {texture ? <VibeTexture vibe={texture} width={width} height={height} still={still} /> : null}
      {vibe.scene === 'turntable' ? <Turntable width={width} height={height} accent={vibe.accent} still={still} /> : null}
      {PARTICLES[vibe.scene] ? <Particles kind={vibe.scene} width={width} height={height} color={vibe.accent} still={still} /> : null}
      {/* Cinematic vignette: shade under the header and the composer. */}
      <LinearGradient colors={[shade, 'transparent', 'transparent', shade]} locations={[0, 0.22, 0.72, 1]} style={StyleSheet.absoluteFill} />
      {vibe.grain === false ? null : <Grain width={width} height={height} opacity={0.06} running={!still} />}
    </>
  );
}

/** How long the old vibe takes to fade off the new one. */
export const VIBE_FADE_MS = 450;
const lookOf = (v) => `${v.id}-${v.customColor ?? ''}`;

// The vibe being replaced, over the new one and fading out. The new one is
// fully drawn underneath from its first frame, and a timer takes this layer
// away even if the fade never runs, so a stalled animation can't leave the
// wrong vibe (or nothing) on screen.
function Leaving({ vibe, width, height, onDone }) {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withTiming(0, { duration: VIBE_FADE_MS, easing: Easing.out(Easing.quad) });
    const t = setTimeout(onDone, VIBE_FADE_MS + 50);
    return () => {
      clearTimeout(t);
      cancelAnimation(o);
    };
  }, [o, onDone]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} testID="chat-backdrop-leaving">
      <Scene vibe={vibe} width={width} height={height} still />
    </Animated.View>
  );
}

/**
 * The thread's backdrop in the chosen vibe. `motion` false is the Static
 * theme setting; `paused` holds it while the thread is off screen.
 */
export default function ChatBackdrop({ vibe = vibeById(), motion = true, paused = false }) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const still = reduced || !motion || paused;
  const [shown, setShown] = useState({ vibe, leaving: null });
  // A new vibe: swap during render, so there's no frame of the wrong one.
  if (lookOf(shown.vibe) !== lookOf(vibe)) setShown({ vibe, leaving: reduced ? null : shown.vibe });
  const [done] = useState(() => () => setShown((s) => ({ ...s, leaving: null })));
  return (
    <View pointerEvents="none" style={[styles.fill, { backgroundColor: vibe.mesh[1] }]} testID="chat-backdrop">
      <View key={lookOf(vibe)} style={StyleSheet.absoluteFill} testID={`chat-backdrop-${vibe.id}`}>
        <Scene vibe={vibe} width={width} height={height} still={still} />
      </View>
      {shown.leaving ? <Leaving key={lookOf(shown.leaving)} vibe={shown.leaving} width={width} height={height} onDone={done} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, zIndex: 0, overflow: 'hidden' },
  glow: { position: 'absolute', left: 0, top: 0 },
  particle: { position: 'absolute', left: 0, top: 0 },
});
