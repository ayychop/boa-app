import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WIDE } from '../hooks/useLayout';
import DisplayMenu from '../components/display/DisplayMenu';
import ZenMode from '../components/display/ZenMode';

const KEY = 'boa:display:v1';
const LAYOUTS = ['full', 'split'];

const DisplayContext = createContext(null);

/**
 * How the app fills a big screen. Unfolded devices (foldables, dual screens,
 * tablets: 640pt and up) choose Full Screen (the phone layout, wider) or
 * Split View (two panes); the choice is saved. Zen Mode is the screensaver
 * on top of either: a clock and what's playing, until the next tap.
 */
export function DisplayProvider({ children }) {
  const { width } = useWindowDimensions();
  const unfolded = width >= WIDE;
  const [layout, setLayoutState] = useState('full');
  const [zen, setZen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastActivity = useRef(Date.now());

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        const saved = raw && JSON.parse(raw).layout;
        if (LAYOUTS.includes(saved)) setLayoutState(saved);
      })
      .catch(() => {});
  }, []);

  const setLayout = useCallback((next) => {
    setLayoutState(next);
    AsyncStorage.setItem(KEY, JSON.stringify({ layout: next })).catch(() => {});
  }, []);

  const touch = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  // On web, keys (the radio carousel browses with ←/→), the mouse and the
  // scroll wheel count as activity too.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const events = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true, capture: true }));
    return () => events.forEach((e) => window.removeEventListener(e, touch, { capture: true }));
  }, [touch]);

  const exitZen = useCallback(() => {
    touch();
    setZen(false);
  }, [touch]);

  const value = useMemo(
    () => ({
      unfolded,
      layout,
      split: unfolded && layout === 'split',
      setLayout,
      zen,
      enterZen: () => setZen(true),
      exitZen,
      openMenu: () => setMenuOpen(true),
      lastActivity,
    }),
    [unfolded, layout, setLayout, zen, exitZen],
  );

  return (
    <DisplayContext.Provider value={value}>
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
      {zen && <ZenMode onExit={exitZen} />}
      <DisplayMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </DisplayContext.Provider>
  );
}

export function useDisplay() {
  const ctx = useContext(DisplayContext);
  if (!ctx) throw new Error('useDisplay must be used inside <DisplayProvider>');
  return ctx;
}

/** Calls onIdle once nothing has touched the screen for `ms` while enabled. */
export function useIdle(ms, enabled, onIdle) {
  const { lastActivity } = useDisplay();
  const callback = useRef(onIdle);
  callback.current = onIdle;
  useEffect(() => {
    if (!enabled) return;
    // Count from now, not from a touch made before this was switched on.
    lastActivity.current = Math.max(lastActivity.current, Date.now());
    const id = setInterval(() => {
      if (Date.now() - lastActivity.current >= ms) callback.current();
    }, 1000);
    return () => clearInterval(id);
  }, [ms, enabled, lastActivity]);
}
