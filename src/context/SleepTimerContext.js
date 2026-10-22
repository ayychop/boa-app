import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { usePlayer } from './PlayerContext';
import SleepTimerMenu from '../components/SleepTimerMenu';

const SleepTimerContext = createContext(null);
// Ticks once a second while a timer runs; kept apart so only countdown
// labels re-render, not everything that can start a timer.
const RemainingContext = createContext(0);

export const SLEEP_OPTIONS = [
  { minutes: 15, label: '15 minutes' },
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
];

/** "14:05" for the last hour, "1:00:00" above it. */
export function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * Sleep timer: pauses playback when it runs out, then dims the whole app a
 * little, the way a room goes quiet. Any tap brings the light back.
 */
export function SleepTimerProvider({ children }) {
  const { pause, isPlaying } = usePlayer();
  const [endsAt, setEndsAt] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dimmed, setDimmed] = useState(false);

  useEffect(() => {
    if (!endsAt) return;
    const tick = () => {
      const left = endsAt - Date.now();
      setRemaining(left);
      if (left > 0) return;
      setEndsAt(null);
      if (isPlaying) pause();
      setDimmed(true);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt, isPlaying, pause]);

  const start = useCallback((minutes) => {
    setDimmed(false);
    setEndsAt(Date.now() + minutes * 60 * 1000);
    setMenuOpen(false);
  }, []);

  const cancel = useCallback(() => {
    setEndsAt(null);
    setMenuOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      active: endsAt !== null,
      start,
      cancel,
      openMenu: () => setMenuOpen(true),
    }),
    [endsAt, start, cancel],
  );

  return (
    <SleepTimerContext.Provider value={value}>
      <RemainingContext.Provider value={endsAt ? remaining : 0}>
        {children}
        {dimmed && (
          <Animated.View entering={FadeIn.duration(2400)} exiting={FadeOut.duration(400)} style={styles.dim}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setDimmed(false)}
              accessibilityRole="button"
              accessibilityLabel="Sleep timer finished. Tap to wake the screen"
            />
          </Animated.View>
        )}
        <SleepTimerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      </RemainingContext.Provider>
    </SleepTimerContext.Provider>
  );
}

export function useSleepTimer() {
  const ctx = useContext(SleepTimerContext);
  if (!ctx) throw new Error('useSleepTimer must be used inside <SleepTimerProvider>');
  return ctx;
}

/** Milliseconds left on the timer, or 0 when none is set. */
export function useSleepRemaining() {
  return useContext(RemainingContext);
}

const styles = StyleSheet.create({
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 1000 },
});
