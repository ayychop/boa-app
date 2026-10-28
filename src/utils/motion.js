import { useCallback, useEffect, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { haptics } from './haptics';

// One feel for every press and sheet in the app: a soft, premium spring
// that settles with the smallest overshoot, run on the UI thread.
export const SPRING = { damping: 15, stiffness: 150 };

/**
 * Tactical: quick and exact, no bounce at all. Close to critically damped,
 * with the overshoot clamped, so it lands and stops (the call screen's
 * dock, drawers and buttons).
 */
export const TACTICAL = { damping: 30, stiffness: 320, mass: 1, overshootClamping: true };

/** A layout animation (FadeInDown, SlideInDown, ...) on the tactical spring. */
export const settle = (builder) => builder.springify().damping(TACTICAL.damping).stiffness(TACTICAL.stiffness).mass(TACTICAL.mass).overshootClamping(1);

/** How far a pressed button dips. */
export const PRESS_SCALE = 0.96;

/**
 * Tactile press feedback for anything tappable: it dips to `to` on the
 * spring and taps the phone as the finger lands. Spread the handlers onto
 * a Pressable and put `style` on the Animated.View it should scale.
 */
export function usePress({ to = PRESS_SCALE, haptic = true, spring = SPRING } = {}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    style,
    onPressIn: () => {
      if (haptic) haptics.tap();
      scale.value = withSpring(to, spring);
    },
    onPressOut: () => {
      scale.value = withSpring(1, spring);
    },
  };
}

/**
 * A full-screen modal that rises on the spring and eases back down before
 * it closes. Put `style` on the modal's root Animated.View (with
 * animationType="none") and close with `dismiss`, which runs onDone once
 * it's out of sight.
 */
export function useSlideUp(onDone) {
  const { height } = useWindowDimensions();
  const y = useSharedValue(height);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    y.value = withSpring(0, SPRING);
  }, [y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const finish = useCallback(() => done.current?.(), []);
  const dismiss = useCallback(() => {
    y.value = withTiming(height, { duration: 260, easing: Easing.in(Easing.cubic) }, (ok) => {
      if (ok) scheduleOnRN(finish);
    });
  }, [y, height, finish]);
  return { style, dismiss };
}
