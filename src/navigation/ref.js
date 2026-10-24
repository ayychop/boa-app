import { createNavigationContainerRef } from '@react-navigation/native';

// The app's navigation, reachable from outside the screens (the lock
// handler in ZenContext, deep links from the lock screen and the widget,
// alarms). The tabs live in the root stack's "Tabs" screen, with full-screen
// pages (the forecast, alarms, the Creative Hub's threads) stacked over them.
export const navigationRef = createNavigationContainerRef();

export const TABS = ['Home', 'Radio', 'Zen', 'Originals', 'Talent', 'Profile'];

/** The screen on screen (a tab, or a page over the tabs), or null before navigation is ready. */
export const currentTab = () => (navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name ?? null : null);

/** Goes to a tab, closing any pages stacked over the tabs. */
export function goToTab(name, params) {
  if (!navigationRef.isReady()) return false;
  navigationRef.navigate('Tabs', { screen: name, params, merge: true });
  return true;
}

/** Opens a full-screen page over the tabs (Forecast, Alarms, ...). */
export function openPage(name, params) {
  if (!navigationRef.isReady()) return false;
  navigationRef.navigate(name, params);
  return true;
}
