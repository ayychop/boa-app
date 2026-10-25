import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Grain from '../Grain';
import { startLoop } from '../../utils/loop';
import { colors } from '../../theme';

// Three soft lights drifting behind the conversation, each on its own slow
// loop so the scene never repeats exactly: warm gold up top, a deep amber
// low down, and a faint cool light for contrast. x and y are where each
// light's centre travels between (fractions of the screen); size is its
// diameter as a fraction of the screen's width. They only move transform
// and opacity (no layout), so they stay on the UI thread.
export const LIGHTS = [
  { id: 'gold', color: colors.gold, size: 1.5, x: [0.12, 0.5], y: [0.1, 0.24], opacity: [0.55, 0.8], ms: 14000 },
  { id: 'amber', color: '#C2601F', size: 1.7, x: [0.85, 0.5], y: [0.78, 0.6], opacity: [0.45, 0.65], ms: 19000 },
  { id: 'cool', color: '#3B5B8C', size: 1.2, x: [0.95, 0.7], y: [0.36, 0.5], opacity: [0.22, 0.38], ms: 23000 },
];

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

/** The chat thread's living backdrop. Render it first, behind everything. */
export default function AmbientGlow() {
  const { width, height } = useWindowDimensions();
  const still = useReducedMotion();
  return (
    <View pointerEvents="none" style={styles.fill} testID="chat-ambient">
      {LIGHTS.map((l) => (
        <Light key={l.id} light={l} width={width} height={height} still={still} />
      ))}
      {/* A dark veil keeps the lights behind the words, never over them. */}
      <View style={styles.veil} />
      <Grain width={width} height={height} opacity={0.07} running={!still} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, zIndex: 0, backgroundColor: colors.bg, overflow: 'hidden' },
  light: { position: 'absolute', left: 0, top: 0 },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,6,0.22)' },
});
