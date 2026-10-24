import { createNavigationContainerRef } from '@react-navigation/native';

// The app's navigation, reachable from outside the screens (the lock and
// idle handlers in ZenContext switch to the Zen tab through it).
export const navigationRef = createNavigationContainerRef();

/** The tab on screen, or null before navigation is ready. */
export const currentTab = () => (navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name ?? null : null);
