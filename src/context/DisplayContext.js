import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import { usePlayer } from './PlayerContext';
import { useUser } from './UserContext';
import { overlayOpen } from '../utils/overlays';
import ZenMode from '../components/display/ZenMode';

// Untouched this long, the app drifts into passive Zen Mode: quickly while
// music plays (before most phones would turn the screen off), more slowly
// when nothing does.
const IDLE_PLAYING = 25000;
const IDLE_QUIET = 60000;

const DisplayContext = createContext(null);

/**
 * Zen Mode, the screensaver over the whole app: 'active' when started by
 * hand (with its controls), 'passive' when it starts by itself (just the
 * picture, until the next tap). It starts by itself when the app sits idle,
 * and when the phone is locked or the app is left, so the screensaver is
 * what you come back to.
 */
export function DisplayProvider({ children }) {
  const [zen, setZen] = useState(null);
  const lastActivity = useRef(Date.now());

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

  const { isPlaying } = usePlayer();
  const { onboarded } = useUser();
  const onboardedRef = useRef(onboarded);
  onboardedRef.current = onboarded;

  // Locking the phone (or leaving the app) takes the app to 'inactive' or
  // 'background'. Nothing is mounted then: the app is off screen and
  // mounting there is what froze it. It is only noted, and passive Zen
  // fades in once the app is active again, so the screensaver is what you
  // come back to. The vibe check is left alone. Idle timers only run in the
  // foreground, and coming back counts as a touch.
  const [foreground, setForeground] = useState(AppState.currentState === 'active' || AppState.currentState == null);
  const wasLocked = useRef(false);
  const zenRef = useRef(zen);
  zenRef.current = zen;
  useEffect(() => {
    let resume;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        touch();
        setForeground(true);
        if (wasLocked.current) {
          wasLocked.current = false;
          // A beat for the window to settle before anything mounts.
          clearTimeout(resume);
          resume = setTimeout(() => enterZen('passive'), 250);
        }
      } else if (next === 'inactive' || next === 'background') {
        clearTimeout(resume);
        if (onboardedRef.current && !zenRef.current) wasLocked.current = true;
        setForeground(false);
      }
    });
    return () => {
      clearTimeout(resume);
      sub.remove();
    };
  }, [touch, enterZen]);

  // Passive Zen after idling: the app proper, nothing in front of it and
  // nobody touching the screen.
  const idleMs = isPlaying ? IDLE_PLAYING : IDLE_QUIET;
  const watching = foreground && onboarded && !zen;
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
      zen: !!zen,
      zenMode: zen,
      enterZen,
      exitZen,
      lastActivity,
    }),
    [zen, enterZen, exitZen],
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
    </DisplayContext.Provider>
  );
}

export function useDisplay() {
  const ctx = useContext(DisplayContext);
  if (!ctx) throw new Error('useDisplay must be used inside <DisplayProvider>');
  return ctx;
}
