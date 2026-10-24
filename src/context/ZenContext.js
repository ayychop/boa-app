import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useUser } from './UserContext';
import { currentTab, goToTab, navigationRef, TABS } from '../navigation/ref';
import { addScreenListener } from '../../modules/boa-screen';

// The screen-off broadcast and the app going to the background arrive
// within moments of each other, in either order; the app counts as having
// been on screen if it went to the background this recently.
const LOCK_WINDOW_MS = 2000;

const ZenContext = createContext(null);

/**
 * Zen is an ordinary tab (screens/ZenScreen.js), opened in exactly two ways:
 * - by hand: the Zen tab, or a Zen button (Home, Radio, Profile), with its
 *   controls;
 * - when the phone's screen turns off (power button, lock, screen timeout)
 *   while the app is the one on screen: it opens as the screensaver
 *   ("ambient": just the room, the clock and what's playing), and a tap
 *   takes you back to the tab you were on.
 *
 * Nothing else opens it. Leaving the app (home button, app switcher, a
 * permission dialog, opening Shazam) is not a lock: React Native's AppState
 * reports all of those as 'background' too, so the lock comes from the
 * system's own screen-off broadcast (modules/boa-screen). Coming back to
 * the app always lands on the screen you left.
 */
export function ZenProvider({ children }) {
  const [ambient, setAmbient] = useState(false);
  const { onboarded } = useUser();
  const onboardedRef = useRef(onboarded);
  onboardedRef.current = onboarded;
  // Where the screensaver was opened from, to go back there on waking.
  const returnTo = useRef(null);

  /** Goes to the Zen tab with its controls. */
  const openZen = useCallback(() => {
    if (!navigationRef.isReady()) return false;
    returnTo.current = null;
    setAmbient(false);
    if (currentTab() !== 'Zen') goToTab('Zen');
    return true;
  }, []);

  /** Goes to the Zen tab as the screensaver, remembering where you were. */
  const openScreensaver = useCallback(() => {
    if (!navigationRef.isReady()) return false;
    const from = currentTab();
    // A page over the tabs (the forecast, a chat, alarms) stays put: locking
    // the phone never closes what you were reading or writing.
    if (from && !TABS.includes(from)) return false;
    if (from !== 'Zen') returnTo.current = from;
    setAmbient(true);
    if (from !== 'Zen') goToTab('Zen');
    return true;
  }, []);

  /**
   * Ends the screensaver. Opened by a lock from another tab, it goes back
   * there; opened on the Zen tab, it shows Zen's controls.
   */
  const wake = useCallback(() => {
    setAmbient(false);
    const back = returnTo.current;
    returnTo.current = null;
    if (back && navigationRef.isReady() && currentTab() === 'Zen') goToTab(back);
  }, []);

  // Whether the app is on screen, and when it last stopped being.
  const appActive = useRef(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const leftAt = useRef(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const active = next === 'active';
      if (appActive.current && !active) leftAt.current = Date.now();
      appActive.current = active;
    });
    return () => sub.remove();
  }, []);

  // The lock: the screen turned off while the app was the one on screen.
  // The vibe check is left alone.
  useEffect(
    () =>
      addScreenListener((state) => {
        if (state !== 'off' || !onboardedRef.current) return;
        const wasOnScreen = appActive.current || Date.now() - leftAt.current < LOCK_WINDOW_MS;
        if (wasOnScreen) openScreensaver();
      }),
    [openScreensaver],
  );

  const value = useMemo(() => ({ ambient, openZen, openScreensaver, wake }), [ambient, openZen, openScreensaver, wake]);

  return <ZenContext.Provider value={value}>{children}</ZenContext.Provider>;
}

export function useZen() {
  const ctx = useContext(ZenContext);
  if (!ctx) throw new Error('useZen must be used inside <ZenProvider>');
  return ctx;
}
