import { Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { safelyAsync } from './safely';

// The Android system navigation bar (the three buttons or the gesture pill,
// on a translucent dark scrim). The Zen screensaver is the whole screen, so
// while it is up the bar is hidden: a swipe from the bottom edge brings it
// back for a moment and it slides away again. Expo's own module does the
// window work (WindowInsetsController), so it behaves on every Android
// version the app supports.
//
// Both calls go through `safelyAsync`: the activity can be going away when
// they land, and a rejection nobody awaits is a crash, not a message.

/** Hides the navigation bar. Resolves to whether it asked to. Never throws. */
export function hideNavBar() {
  if (Platform.OS !== 'android') return Promise.resolve(false);
  return safelyAsync(
    'nav bar hide',
    async () => {
      await NavigationBar.setVisibilityAsync('hidden');
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
      await NavigationBar.setVisibilityAsync('visible');
      return true;
    },
    false,
  );
}
