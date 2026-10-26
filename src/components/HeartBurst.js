import { forwardRef, useImperativeHandle, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { haptics } from '../utils/haptics';
import { colors } from '../theme';

export const HEART = '#FF3B5C';

// Six small hearts thrown out from the centre, at these angles.
const SPARKS = [-90, -30, 30, 90, 150, 210];

function Spark({ angle, t }) {
  const rad = (angle * Math.PI) / 180;
  const style = useAnimatedStyle(() => ({
    opacity: t.value === 0 ? 0 : 1 - t.value,
    transform: [{ translateX: Math.cos(rad) * 70 * t.value }, { translateY: Math.sin(rad) * 70 * t.value }, { scale: 0.4 + t.value * 0.5 }],
  }));
  return (
    <Animated.View style={[styles.spark, style]}>
      <Ionicons name="heart" size={16} color={angle % 60 === 0 ? colors.gold : HEART} />
    </Animated.View>
  );
}

/**
 * The big heart over a photo or video: it pops in with an overshoot, sends
 * out a ring of little hearts, holds for a beat and floats off. Call
 * ref.play() (a double tap does). Under Reduce Motion it just fades.
 */
export const HeartBurst = forwardRef(function HeartBurst(_, ref) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const lift = useSharedValue(0);
  const sparks = useSharedValue(0);
  useImperativeHandle(ref, () => ({
    play() {
      if (reduce) {
        scale.value = 1;
        opacity.value = withSequence(withTiming(1, { duration: 120 }), withDelay(500, withTiming(0, { duration: 250 })));
        return;
      }
      lift.value = 0;
      scale.value = withSequence(withSpring(1.18, { duration: 320, dampingRatio: 0.5 }), withSpring(1, { duration: 260, dampingRatio: 0.8 }));
      opacity.value = withSequence(withTiming(1, { duration: 90 }), withDelay(560, withTiming(0, { duration: 280 })));
      lift.value = withDelay(620, withTiming(-40, { duration: 300, easing: Easing.in(Easing.quad) }));
      sparks.value = 0;
      sparks.value = withDelay(80, withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }));
    },
  }));
  const heartStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: lift.value }, { scale: scale.value }] }));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
      {SPARKS.map((a) => (
        <Spark key={a} angle={a} t={sparks} />
      ))}
      <Animated.View style={heartStyle}>
        <Ionicons name="heart" size={110} color={HEART} style={styles.glow} />
      </Animated.View>
    </View>
  );
});

/** A heart toggle: pops when it fills. No count, ever. */
export function HeartButton({ on, onPress, size = 28, label = 'Heart', testID }) {
  const s = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const [busy, setBusy] = useState(false);
  return (
    <Pressable
      onPress={async () => {
        if (busy) return;
        if (!on) {
          s.value = withSequence(withTiming(0.7, { duration: 80 }), withSpring(1, { duration: 420, dampingRatio: 0.38 }));
          haptics.tap();
        }
        setBusy(true);
        try {
          await onPress?.();
        } finally {
          setBusy(false);
        }
      }}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={on ? `Remove ${label.toLowerCase()}` : label}
      accessibilityState={{ selected: !!on }}
      testID={testID}
    >
      <Animated.View style={style}>
        <Ionicons name={on ? 'heart' : 'heart-outline'} size={size} color={on ? HEART : colors.text} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  glow: { textShadowColor: 'rgba(255,59,92,0.75)', textShadowRadius: 28, textShadowOffset: { width: 0, height: 0 } },
  spark: { position: 'absolute' },
});
