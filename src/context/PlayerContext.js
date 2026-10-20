import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as engine from '../audio/engine';

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const [station, setStation] = useState(null);
  const [audio, setAudio] = useState({ status: 'idle', title: null });

  useEffect(() => engine.subscribe(setAudio), []);

  const play = useCallback((next) => {
    setStation(next);
    engine.play(next);
  }, []);

  const pause = useCallback(() => engine.pause(), []);

  // Tapping a record: pause it if it's the one playing, otherwise play it.
  const toggle = useCallback(
    (target = station) => {
      if (!target) return;
      const active = target.id === station?.id;
      if (active && (audio.status === 'playing' || audio.status === 'loading')) pause();
      else play(target);
    },
    [station, audio.status, play, pause],
  );

  const value = useMemo(
    () => ({
      station,
      status: audio.status,
      trackTitle: audio.title,
      isPlaying: audio.status === 'playing' || audio.status === 'loading',
      play,
      pause,
      toggle,
    }),
    [station, audio, play, pause, toggle],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return ctx;
}
