import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Grain from '../Grain';
import { startLoop } from '../../utils/loop';
import { colors } from '../../theme';

// Three soft lights drifting behind the conversation, each on its own slow
// loop so the scene never repeats exactly: warm gold high up, a deep amber
// low down, and a faint cool light for contrast. They only move transform
// and opacity (no layout), so they stay on the UI thread.
const LIGHTS = [
  { id: 'gold', color: colors.gold, size: 1.15, x: [-0.3, 0.05], y: [-0.18, -0.02], opacity: [0.32, 0.5], ms: 14000 },
  { id: 'amber', color: '#B4541E', size: 1.3, x: [0.25, -0.05], y: [0.5, 0.36], opacity: [0.22, 0.36], ms: 19000 },
  { id: 'cool', color: '#3B5B8C', size: 0.95, x: [0.55, 0.32], y: [0.12, 0.3], opacity: [0.1, 0.2], ms: 23000 },
];

function Light({ light, width, height, still }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (still) return undefined;
    return startLoop(t, light.ms, Easing.inOut(Easing.sin), true);
  }, [still, t, light.ms]);
  const size = Math.round(Math.max(width, height) * light.size);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 1], light.opacity),
    transform: [
      { translateX: interpolate(t.value, [0, 1], light.x) * width },
      { translateY: interpolate(t.value, [0, 1], light.y) * height },
      { scale: interpolate(t.value, [0, 1], [1, 1.12]) },
    ],
  }));
  return (
    <Animated.View style={[styles.light, { width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={`ambient-${light.id}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={light.color} stopOpacity={0.9} />
            <Stop offset="0.4" stopColor={light.color} stopOpacity={0.35} />
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
      <Grain width={width} height={height} opacity={0.045} running={!still} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg, overflow: 'hidden' },
  light: { position: 'absolute', left: 0, top: 0 },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,6,0.38)' },
});
