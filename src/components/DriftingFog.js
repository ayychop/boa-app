import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Smoke from './Smoke';

// Each layer is drawn at a quarter of its size and scaled up. Smoke has no
// hard edges, so it looks the same, and the bitmap behind a full-screen
// layer stays small instead of tens of megabytes on a big screen.
const RES = 4;
// Layers overhang the frame so their edges never come into view as they drift.
const OVERHANG = 1.5;

/**
 * One layer of smoke wandering on a slow loop (a sine path, so it returns to
 * where it started with no jump).
 */
function FogLayer({ width, height, opacity, duration, variant, reverse }) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
  }, [reduceMotion, duration, t]);
  const w = width * OVERHANG;
  const h = height * OVERHANG;
  const style = useAnimatedStyle(() => {
    const a = t.value * Math.PI * 2 * (reverse ? -1 : 1);
    return {
      transform: [
        { translateX: Math.sin(a) * width * 0.16 },
        { translateY: Math.cos(a) * height * 0.06 },
        { scale: RES * (1.04 + Math.sin(a * 2) * 0.04) },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        { position: 'absolute', width: w / RES, height: h / RES, left: (width - w / RES) / 2, top: (height - h / RES) / 2 },
        style,
      ]}
    >
      <Smoke opacity={opacity} variant={variant} />
    </Animated.View>
  );
}

/**
 * BOA's smoke: two vector layers drifting across each other at different
 * speeds and directions. Still under Reduce Motion.
 */
export default function DriftingFog({ width, height, opacity = 1 }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity, overflow: 'hidden' }]}>
      <FogLayer width={width} height={height} opacity={0.14} duration={70000} variant={0} />
      <FogLayer width={width} height={height} opacity={0.1} duration={46000} variant={1} reverse />
    </View>
  );
}
