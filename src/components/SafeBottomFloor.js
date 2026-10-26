import { useMemo } from 'react';
import { Platform } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

// Android's gesture bar needs at least this much clear space, even on a
// device that reports no bottom inset in edge-to-edge mode (some Samsung
// builds do, on the Fold's cover screen especially).
export const ANDROID_MIN_BOTTOM_INSET = 20;

/** The insets, with the bottom one never under Android's gesture bar. */
export function floorInsets(insets, os = Platform.OS) {
  if (os !== 'android' || insets.bottom >= ANDROID_MIN_BOTTOM_INSET) return insets;
  return { ...insets, bottom: ANDROID_MIN_BOTTOM_INSET };
}

/**
 * Every screen under this reads the floored insets from useSafeAreaInsets(),
 * so a page's last line ("Share your first post") and its buttons always
 * sit above the navigation bar, whatever the phone reports.
 */
export default function SafeBottomFloor({ children }) {
  const insets = useSafeAreaInsets();
  const value = useMemo(() => floorInsets(insets), [insets]);
  return <SafeAreaInsetsContext.Provider value={value}>{children}</SafeAreaInsetsContext.Provider>;
}
