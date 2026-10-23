import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, useWindowDimensions, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WIDE } from '../hooks/useLayout';
import { usePlayer } from './PlayerContext';
import { useUser } from './UserContext';
import { overlayOpen } from '../utils/overlays';
import DisplayMenu from '../components/display/DisplayMenu';
import ZenMode from '../components/display/ZenMode';

const KEY = 'boa:display:v1';
const LAYOUTS = ['full', 'split'];
// Untouched this long, the app drifts into passive Zen Mode: quickly while
// music plays (before most phones would turn the screen off), more slowly
// when nothing does.
const IDLE_PLAYING = 25000;
const IDLE_QUIET = 60000;

const DisplayContext = createContext(null);

/**
 * How the app fills a big screen. Unfolded devices (foldables, dual screens,
 * tablets: 640pt and up) choose Full Screen (the phone layout, wider) or
 * Split View (two panes); the choice is saved. Zen Mode is the screensaver
 * on top of either, on any screen size: 'active' when started by hand (with
 * its controls), 'passive' when the app has sat idle (just the picture,
 * until the next tap).
 */
export function DisplayProvider({ children }) {
  const { width } = useWindowDimensions();
  const unfolded = width >= WIDE;
  const [layout, setLayoutState] = useState('full');
  const [zen, setZen] = useState(null);
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
    setZen(null);
  }, [touch]);

  const enterZen = useCallback((mode = 'active') => setZen((z) => z ?? (mode === 'passive' ? 'passive' : 'active')), []);

  // Idle timers only run while the app is on screen; coming back counts as
  // a touch, so it never opens straight into the screensaver.
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const fg = next === 'active';
      if (fg) touch();
      setForeground(fg);
    });
    return () => sub.remove();
  }, [touch]);

  // Passive Zen: the app proper (not the vibe check), nothing in front of
  // it and nobody touching the screen.
  const { isPlaying } = usePlayer();
  const { onboarded } = useUser();
  const idleMs = isPlaying ? IDLE_PLAYING : IDLE_QUIET;
  const watching = foreground && onboarded && !zen && !menuOpen;
  useEffect(() => {
    if (!watching) return;
    lastActivity.current = Math.max(lastActivity.current, Date.now());
    const id = setInterval(() => {
      if (Date.now() - lastActivity.current < idleMs) return;
      // A sheet, video or player is up: Zen would sit hidden under it.
      if (overlayOpen()) touch();
      else enterZen('passive');
    }, 1000);
    return () => clearInterval(id);
  }, [watching, idleMs, touch, enterZen]);

  const value = useMemo(
    () => ({
      unfolded,
      layout,
      split: unfolded && layout === 'split',
      setLayout,
      zen: !!zen,
      zenMode: zen,
      enterZen,
      exitZen,
      openMenu: () => setMenuOpen(true),
      lastActivity,
    }),
    [unfolded, layout, setLayout, zen, enterZen, exitZen],
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
      {zen && <ZenMode key={zen} mode={zen} onExit={exitZen} />}
      <DisplayMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </DisplayContext.Provider>
  );
}

export function useDisplay() {
  const ctx = useContext(DisplayContext);
  if (!ctx) throw new Error('useDisplay must be used inside <DisplayProvider>');
  return ctx;
}
