import { cancelAnimation, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

/**
 * A 0..1 loop that can be paused and picked up again: it carries on from
 * wherever the value is (frozen by `cancelAnimation`), finishes that lap in
 * the time it has left, then loops as usual. `reverse` rocks 0..1..0
 * instead of jumping back to 0. Start one in an effect and return `stop`.
 */
export function startLoop(value, duration, easing, reverse = false) {
  const from = Math.min(1, Math.max(0, value.value));
  const lap = (to) => withTiming(to, { duration, easing });
  const rest = withTiming(1, { duration: Math.max(0, (1 - from) * duration), easing });
  value.value = reverse
    ? withSequence(rest, withRepeat(withSequence(lap(0), lap(1)), -1, false))
    : withSequence(rest, withTiming(0, { duration: 0 }), withRepeat(lap(1), -1, false));
  return () => cancelAnimation(value);
}
