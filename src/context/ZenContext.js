import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import { usePlayer } from './PlayerContext';
import { useUser } from './UserContext';
import { overlayOpen } from '../utils/overlays';
import { currentTab, navigationRef } from '../navigation/ref';

// Untouched this long, the app drifts to the Zen tab as a screensaver:
// quickly while music plays (before most phones would turn the screen
// off), more slowly when nothing does.
const IDLE_PLAYING = 25000;
const IDLE_QUIET = 60000;

const ZenContext = createContext(null);

/**
 * Zen is an ordinary tab (screens/ZenScreen.js): no overlay, no extra
 * window, nothing that can sit over the app and swallow touches. This only
 * decides when to go there and whether it opens as a screensaver
 * ("ambient": just the room, the clock and what's playing, no controls or
 * tab bar, until the next tap):
 * - locking the phone or leaving the app ('inactive' or 'background'),
 *   so the screensaver is what you come back to;
 * - the app sitting idle;
 * - a Zen button (Home, Radio, Profile) or the Zen tab, with controls.
 * Switching tabs is a plain navigation state change, safe to do while the
 * app is in the background.
 */
export function ZenProvider({ children }) {
  const [ambient, setAmbient] = useState(false);
  const lastActivity = useRef(Date.now());
  const { isPlaying } = usePlayer();
  const { onboarded } = useUser();
  const onboardedRef = useRef(onboarded);
  onboardedRef.current = onboarded;

  const touch = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  // On web, keys (the radio carousel browses with the arrow keys), the
  // mouse and the scroll wheel count as activity too.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const events = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true, capture: true }));
    return () => events.forEach((e) => window.removeEventListener(e, touch, { capture: true }));
  }, [touch]);

  /** Goes to the Zen tab: as the screensaver, or with its controls. */
  const openZen = useCallback((asScreensaver = false) => {
    if (!navigationRef.isReady()) return false;
    setAmbient(asScreensaver);
    if (currentTab() !== 'Zen') navigationRef.navigate('Zen');
    return true;
  }, []);

  const wake = useCallback(() => {
    touch();
    setAmbient(false);
  }, [touch]);

  // Only a known 'background' or 'inactive' counts as away: at launch React
  // Native can report null or 'unknown' while the app is plainly on screen.
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        touch();
        setForeground(true);
        return;
      }
      if (next === 'inactive' || next === 'background') {
        setForeground(false);
        // The vibe check is left alone.
        if (onboardedRef.current) openZen(true);
      }
    });
    return () => sub.remove();
  }, [touch, openZen]);

  // The screensaver after idling: the app proper, nothing in front of it,
  // not already on Zen, nobody touching the screen.
  const idleMs = isPlaying ? IDLE_PLAYING : IDLE_QUIET;
  const watching = foreground && onboarded && !ambient;
  // A chain of one-second timeouts rather than an interval: once it opens
  // the screensaver it stops, so it can't fire again before React has
  // re-rendered, and nothing is ever cleared from inside its own callback.
  useEffect(() => {
    if (!watching) return;
    lastActivity.current = Math.max(lastActivity.current, Date.now());
    let id;
    const check = () => {
      if (Date.now() - lastActivity.current >= idleMs) {
        // A sheet, video or player is up: wait until it's closed.
        if (overlayOpen()) touch();
        else if (openZen(true)) return;
      }
      id = setTimeout(check, 1000);
    };
    id = setTimeout(check, 1000);
    return () => clearTimeout(id);
  }, [watching, idleMs, touch, openZen]);

  const value = useMemo(() => ({ ambient, openZen, wake, touch }), [ambient, openZen, wake, touch]);

  return (
    <ZenContext.Provider value={value}>
      {/* Every touch anywhere, and every drag or scroll, resets the idle
          clock; it never claims the touch. */}
      <View
        style={{ flex: 1 }}
        onStartShouldSetResponderCapture={() => {
          touch();
          return false;
        }}
        onMoveShouldSetResponderCapture={() => {
          touch();
          return false;
        }}
        onTouchStart={touch}
        onTouchMove={touch}
      >
        {children}
      </View>
    </ZenContext.Provider>
  );
}

export function useZen() {
  const ctx = useContext(ZenContext);
  if (!ctx) throw new Error('useZen must be used inside <ZenProvider>');
  return ctx;
}
