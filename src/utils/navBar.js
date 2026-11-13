import { Platform } from 'react-native';
import { SystemBars } from 'react-native-edge-to-edge';
import { safelyAsync } from './safely';

// The Android system navigation bar (the three buttons or the gesture pill).
// The Zen screensaver is the whole screen, so while it is up the bar is
// hidden: a swipe from the bottom edge brings it back for a moment and it
// slides away again. react-native-edge-to-edge hides it through
// WindowInsetsController. The old expo-navigation-bar calls set the bar
// color, which Android 15 deprecates.
//
// Both calls go through `safelyAsync`: the activity can be going away when
// they land, and a throw nobody awaits is a crash, not a message.

/** Hides the navigation bar. Resolves to whether it asked to. Never throws. */
export function hideNavBar() {
  if (Platform.OS !== 'android') return Promise.resolve(false);
  return safelyAsync(
    'nav bar hide',
    async () => {
      SystemBars.setHidden({ navigationBar: true });
      return true;
    },
    false,
  );
}

/** Brings the navigation bar back. Resolves to whether it asked to. Never throws. */
export function showNavBar() {
  if (Platform.OS !== 'android') return Promise.resolve(false);
  return safelyAsync(
    'nav bar show',
    async () => {
      SystemBars.setHidden({ navigationBar: false });
      return true;
    },
    false,
  );
}
