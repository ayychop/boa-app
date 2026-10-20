import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { usePlayer } from './PlayerContext';
import ScreeningRoom from '../components/media/ScreeningRoom';

const MediaContext = createContext(null);

// One full-screen player for the whole app, so Home, Originals and anywhere
// else can open a trailer or episode the same way.
export function MediaProvider({ children }) {
  const { isPlaying, pause } = usePlayer();
  const [screening, setScreening] = useState(null);

  const open = useCallback(
    (next) => {
      // Never talk over the film: radio pauses when a video starts.
      if (isPlaying) pause();
      setScreening(next);
    },
    [isPlaying, pause],
  );

  const value = useMemo(
    () => ({
      openTrailer: (production) => open({ production, kind: 'trailer' }),
      openEpisode: (production, episode = production.episodes[0]) => open({ production, kind: 'episode', episode }),
      close: () => setScreening(null),
    }),
    [open],
  );

  return (
    <MediaContext.Provider value={value}>
      {children}
      <ScreeningRoom screening={screening} onClose={value.close} onSwitch={setScreening} />
    </MediaContext.Provider>
  );
}

export function useMedia() {
  const ctx = useContext(MediaContext);
  if (!ctx) throw new Error('useMedia must be used inside <MediaProvider>');
  return ctx;
}
