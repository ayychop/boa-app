import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { haptics } from './haptics';

// One feel for every press and sheet in the app: a soft, premium spring
// that settles with the smallest overshoot, run on the UI thread.
export const SPRING = { damping: 15, stiffness: 150 };

/** How far a pressed button dips. */
export const PRESS_SCALE = 0.96;

/**
 * Tactile press feedback for anything tappable: it dips to `to` on the
 * spring and taps the phone as the finger lands. Spread the handlers onto
 * a Pressable and put `style` on the Animated.View it should scale.
 */
export function usePress({ to = PRESS_SCALE, haptic = true } = {}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    style,
    onPressIn: () => {
      if (haptic) haptics.tap();
      scale.value = withSpring(to, SPRING);
    },
    onPressOut: () => {
      scale.value = withSpring(1, SPRING);
    },
  };
}
