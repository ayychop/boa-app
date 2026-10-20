import { createContext, useContext, useMemo, useState } from 'react';

// UI-only "now playing" state. Audio playback (react-native-track-player)
// gets wired in behind this same interface in the next phase.
const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const [station, setStation] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const value = useMemo(
    () => ({
      station,
      isPlaying,
      play(next) {
        setStation(next);
        setIsPlaying(true);
      },
      togglePlay() {
        setIsPlaying((p) => !p);
      },
    }),
    [station, isPlaying],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return ctx;
}
