import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Tablets, unfolded foldables, dual screens and phones on their side switch
// to two-column layouts at this window width.
export const WIDE = 768;
// Phones in landscape: the tab bar and mini player slim down below this.
export const SHORT = 500;

/**
 * Screen size for responsive layouts. Tab screens are padded by `side` on
 * both edges (see App.js), so `width` is what they actually get to lay out
 * in. Padding both sides by the larger inset keeps the content's centre on
 * the screen's centre, which is where a dual-screen hinge sits.
 */
export default function useLayout() {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const side = Math.max(insets.left, insets.right);
  return {
    width: window.width - side * 2,
    height: window.height,
    side,
    wide: window.width >= WIDE,
    short: window.height < SHORT,
  };
}
