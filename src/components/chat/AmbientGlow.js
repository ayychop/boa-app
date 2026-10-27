import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Grain from '../Grain';
import VibeTexture from './VibeTexture';
import { startLoop } from '../../utils/loop';
import { vibeById } from '../../chat/vibes';

// The vibe's three soft lights drift over its mesh, each on its own slow
// loop so the scene never repeats exactly. x and y are where each light's
// centre travels between (fractions of the screen); size is its diameter
// as a fraction of the screen's width. They only move transform and
// opacity (no layout), so they stay on the UI thread.

// A faint night sky over the lights: three sets of stars, each set
// brightening and dimming on its own slow breath, so a few twinkle at a
// time. Positions are fixed (a seeded scatter), as fractions of the screen.
const STAR_SETS = 3;
const STARS_PER_SET = 9;
const STAR_MS = [5200, 7300, 9100, 6100];
const seeded = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
export const STARS = Array.from({ length: STAR_SETS * STARS_PER_SET }, (_, i) => ({
  set: i % STAR_SETS,
  x: seeded(i + 1),
  y: seeded(i + 101),
  size: 1 + Math.round(seeded(i + 201) * 1.5),
  gold: seeded(i + 301) > 0.7,
}));
// Midnight's deeper sky: a fourth set, denser and a little larger.
export const DEEP_STARS = Array.from({ length: 36 }, (_, i) => ({
  set: STAR_SETS,
  x: seeded(i + 401),
  y: seeded(i + 501),
  size: 1 + Math.round(seeded(i + 601) * 2),
  gold: seeded(i + 701) > 0.85,
}));

function StarSet({ stars, set, width, height, still, max }) {
  const t = useSharedValue(0.5);
  useEffect(() => {
    if (still) return undefined;
    return startLoop(t, STAR_MS[set], Easing.inOut(Easing.sin), true);
  }, [still, t, set]);
  const style = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0, 1], [max * 0.25, max]) }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} testID={`chat-stars-${set}`}>
      {stars.map((s, i) => (
        <View
          key={i}
          style={[
            styles.star,
            {
              left: s.x * width,
              top: s.y * height,
              width: s.size,
              height: s.size,
              borderRadius: s.size,
              backgroundColor: s.gold ? '#F6D38A' : '#E8ECF5',
            },
          ]}
        />
      ))}
    </Animated.View>
  );
}

function Light({ light, width, height, still }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (still) return undefined;
    return startLoop(t, light.ms, Easing.inOut(Easing.sin), true);
  }, [still, t, light.ms]);
  const size = Math.round(width * light.size);
  // Positioned by its centre: the view's top-left sits half a size up and
  // to the left of the point it travels along.
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 1], light.opacity),
    transform: [
      { translateX: interpolate(t.value, [0, 1], light.x) * width - size / 2 },
      { translateY: interpolate(t.value, [0, 1], light.y) * height - size / 2 },
      { scale: interpolate(t.value, [0, 1], [1, 1.12]) },
    ],
  }));
  return (
    <Animated.View style={[styles.light, { width: size, height: size }, style]} testID={`chat-ambient-${light.id}`}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={`ambient-${light.id}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={light.color} stopOpacity={0.85} />
            <Stop offset="0.45" stopColor={light.color} stopOpacity={0.3} />
            <Stop offset="1" stopColor={light.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#ambient-${light.id})`} />
      </Svg>
    </Animated.View>
  );
}

/** One vibe's whole backdrop: mesh, lights, veil, texture, stars and grain. */
function Scene({ vibe, width, height, still }) {
  return (
    <>
      <LinearGradient colors={vibe.mesh} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} testID={`chat-mesh-${vibe.id}`} />
      {vibe.lights.map((l) => (
        <Light key={`${vibe.id}-${l.id}`} light={l} width={width} height={height} still={still} />
      ))}
      {/* A veil keeps the lights behind the words, never over them. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: vibe.veil }]} />
      <VibeTexture vibe={vibe} width={width} height={height} still={still} />
      {Array.from({ length: STAR_SETS }, (_, set) => (
        <StarSet key={set} stars={STARS.filter((s) => s.set === set)} set={set} width={width} height={height} still={still} max={vibe.stars.max} />
      ))}
      {vibe.stars.deep ? <StarSet stars={DEEP_STARS} set={STAR_SETS} width={width} height={height} still={still} max={vibe.stars.max} /> : null}
      {vibe.grain === false ? null : <Grain width={width} height={height} opacity={0.07} running={!still} />}
    </>
  );
}

/** How long the old vibe takes to fade off the new one. */
export const VIBE_FADE_MS = 450;
const lookOf = (v) => `${v.id}-${v.customColor ?? ''}`;

// The vibe being replaced, laid over the new one and fading out. The new
// vibe underneath is already fully drawn, so if this fade never runs (a
// stalled layout animation on Android left the thread flat before), the
// timer still takes this layer away and the new vibe is simply there.
function Leaving({ vibe, width, height, onDone }) {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withTiming(0, { duration: VIBE_FADE_MS, easing: Easing.out(Easing.quad) });
    const t = setTimeout(onDone, VIBE_FADE_MS + 50);
    return () => clearTimeout(t);
  }, [o, onDone]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} testID="chat-ambient-leaving">
      <Scene vibe={vibe} width={width} height={height} still />
    </Animated.View>
  );
}

/**
 * The chat thread's living backdrop in the chosen vibe: a three-tone mesh,
 * the drifting lights, a veil, the stars and a film grain. Render it first,
 * behind everything. The mesh's middle tone is also its plain fill, so the
 * screen is never black while the gradient draws. The current vibe is never
 * waiting on an animation to become visible: it's drawn at full opacity
 * from its first frame, with the old one fading away on top.
 */
export default function AmbientGlow({ vibe = vibeById() }) {
  const { width, height } = useWindowDimensions();
  const still = useReducedMotion();
  const [shown, setShown] = useState({ vibe, leaving: null });
  // A new vibe: swap during render, so there's no frame of the wrong one.
  if (lookOf(shown.vibe) !== lookOf(vibe)) setShown({ vibe, leaving: still ? null : shown.vibe });
  const [done] = useState(() => () => setShown((s) => ({ ...s, leaving: null })));
  return (
    <View pointerEvents="none" style={[styles.fill, { backgroundColor: vibe.mesh[1] }]} testID="chat-ambient">
      <View key={lookOf(vibe)} style={StyleSheet.absoluteFill} testID="chat-ambient-current">
        <Scene vibe={vibe} width={width} height={height} still={still} />
      </View>
      {shown.leaving ? <Leaving key={lookOf(shown.leaving)} vibe={shown.leaving} width={width} height={height} onDone={done} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, zIndex: 0, overflow: 'hidden' },
  light: { position: 'absolute', left: 0, top: 0 },
  star: { position: 'absolute' },
});
