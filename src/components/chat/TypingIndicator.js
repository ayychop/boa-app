import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius, space } from '../../theme';

// One bounce of all three dots, each a third of a beat behind the last.
const BEAT_MS = 1100;

function Dot({ t, index, size }) {
  const style = useAnimatedStyle(() => {
    // Each dot rises and glows in its own slice of the beat, then rests.
    const local = (t.value - index * 0.18 + 1) % 1;
    const up = interpolate(local, [0, 0.25, 0.5, 1], [0, 1, 0, 0]);
    return { opacity: 0.45 + up * 0.55, transform: [{ translateY: -up * size * 0.9 }, { scale: 1 + up * 0.18 }] };
  });
  return <Animated.View style={[styles.dot, { width: size, height: size, borderRadius: size, boxShadow: `0px 0px ${size * 1.4}px ${colors.gold}` }, style]} />;
}

/** Three gold dots bouncing in turn, glowing as they rise. Still under Reduce Motion. */
export function TypingDots({ size = 7 }) {
  const still = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (still) return undefined;
    t.value = withRepeat(withTiming(1, { duration: BEAT_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [still, t]);
  return (
    <View style={[styles.dots, { gap: size * 0.7, height: size * 2.2 }]} accessibilityElementsHidden importantForAccessibility="no">
      {[0, 1, 2].map((i) => (
        <Dot key={i} t={t} index={i} size={size} />
      ))}
    </View>
  );
}

/** "They're typing": the dots in one of their glass bubbles, at the foot of the thread. */
export default function TypingIndicator({ name }) {
  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(160)}
      style={styles.row}
      testID="typing-indicator"
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${name ?? 'They'} ${name ? 'is' : 'are'} typing`}
    >
      <View style={styles.bubble}>
        <LinearGradient colors={['rgba(255,255,255,0.13)', 'rgba(255,255,255,0.04)']} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={StyleSheet.absoluteFill} />
        <TypingDots />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: 3 },
  bubble: {
    overflow: 'hidden',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderBottomLeftRadius: radius.sm,
    backgroundColor: 'rgba(20,20,24,0.42)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(226,168,75,0.35)',
  },
  dots: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  dot: { backgroundColor: colors.gold },
});
