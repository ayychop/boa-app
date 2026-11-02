import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import useReducedMotion from '../hooks/useReducedMotion';
import { colors } from '../theme';

// The gold sheen on a talent photo, for press (a finger) and hover (a mouse):
// a rim of gold light that fades in around the frame, and one slanted band of
// warm light that crosses the picture once, left to right, and is gone. Both
// run on the UI thread. Under Reduce Motion, or a warm phone, only the rim
// shows (no sweep).
//
//   const sheen = useGoldSheen();
//   <Pressable onPressIn={sheen.onIn} onPressOut={sheen.onOut}>
//     <Headshot sheen={sheen.value} ... />
//
// `value` is two shared values, so a component can drive the sheen from any
// event it likes.

export const SHEEN_SWEEP_MS = 720;
export const SHEEN_RIM_IN_MS = 140;
export const SHEEN_RIM_OUT_MS = 380;

/** Drives a GoldSheen: call onIn when a press or hover starts, onOut when it ends. */
export function useGoldSheen() {
  const sweep = useSharedValue(0);
  const rim = useSharedValue(0);
  const reduce = useReducedMotion();
  return {
    value: { sweep, rim },
    onIn: () => {
      rim.value = withTiming(1, { duration: SHEEN_RIM_IN_MS });
      if (reduce) return;
      sweep.value = 0;
      sweep.value = withTiming(1, { duration: SHEEN_SWEEP_MS, easing: Easing.bezier(0.4, 0, 0.2, 1) });
    },
    onOut: () => {
      rim.value = withTiming(0, { duration: SHEEN_RIM_OUT_MS });
    },
  };
}

/**
 * The sheen itself, laid over a frame of `width` x `height`. It doesn't take
 * touches. `sheen` is useGoldSheen().value.
 */
export default function GoldSheen({ sheen, width, height, radius = 14 }) {
  const band = width * 0.5;
  const rimStyle = useAnimatedStyle(() => ({ opacity: sheen.rim.value }));
  const bandStyle = useAnimatedStyle(() => ({
    // In from past the left edge, out past the right.
    transform: [{ translateX: -band + sheen.sweep.value * (width + band * 1.6) }, { skewX: '-18deg' }],
    // Only visible mid-sweep.
    opacity: Math.sin(Math.min(1, Math.max(0, sheen.sweep.value)) * Math.PI) * 0.85,
  }));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius }]} testID="gold-sheen">
      <Animated.View style={[StyleSheet.absoluteFill, styles.rim, { borderRadius: radius }, rimStyle]} />
      <Animated.View style={[styles.band, { width: band, height }, bandStyle]}>
        <LinearGradient
          colors={['rgba(255,236,190,0)', 'rgba(255,226,160,0.42)', 'rgba(255,248,230,0.62)', 'rgba(255,226,160,0.42)', 'rgba(255,236,190,0)']}
          locations={[0, 0.3, 0.5, 0.7, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The rim: a gold line just inside the frame, with a soft glow under it.
  rim: {
    borderWidth: 1.5,
    borderColor: colors.gold,
    backgroundColor: 'rgba(226,168,75,0.06)',
  },
  band: { position: 'absolute', top: 0, left: 0 },
});
