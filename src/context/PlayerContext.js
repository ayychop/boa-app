import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as engine from '../audio/engine';

const PlayerContext = createContext(null);
// Position ticks several times a second; keep it in its own context so only
// scrubbers and progress bars re-render, not the whole app.
const ProgressContext = createContext({ position: 0, duration: 0 });

export function PlayerProvider({ children }) {
  // What's loaded: a radio station or a podcast episode (see audio/engine.js).
  const [current, setCurrent] = useState(null);
  const [core, setCore] = useState({ status: 'idle', title: null, rate: 1 });
  const [progress, setProgress] = useState({ position: 0, duration: 0 });

  useEffect(
    () =>
      engine.subscribe((s) => {
        setCore((c) => (c.status === s.status && c.title === s.title && c.rate === s.rate ? c : { status: s.status, title: s.title, rate: s.rate }));
        setProgress((p) => (p.position === s.position && p.duration === s.duration ? p : { position: s.position, duration: s.duration }));
      }),
    [],
  );

  const play = useCallback((item) => {
    setCurrent(item);
    engine.play(item);
  }, []);

  const pause = useCallback(() => engine.pause(), []);

  const isPlaying = core.status === 'playing' || core.status === 'loading';

  // Tapping a record or cover: pause it if it's the one playing, else play it.
  const toggle = useCallback(
    (target = current) => {
      if (!target) return;
      if (target.id === current?.id && isPlaying) pause();
      else play(target);
    },
    [current, isPlaying, play, pause],
  );

  const value = useMemo(
    () => ({
      current,
      status: core.status,
      trackTitle: core.title,
      rate: core.rate,
      isPlaying,
      play,
      pause,
      toggle,
      seek: engine.seek,
      skip: engine.skip,
      setRate: engine.setRate,
    }),
    [current, core, isPlaying, play, pause, toggle],
  );

  return (
    <PlayerContext.Provider value={value}>
      <ProgressContext.Provider value={progress}>{children}</ProgressContext.Provider>
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return ctx;
}

export function usePlaybackProgress() {
  return useContext(ProgressContext);
}
