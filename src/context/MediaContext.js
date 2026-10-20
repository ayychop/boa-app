import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { usePlayer } from './PlayerContext';
import { episodeItem, podcastById } from '../data/podcasts';
import ScreeningRoom from '../components/media/ScreeningRoom';
import PodcastPlayer from '../components/media/PodcastPlayer';

const MediaContext = createContext(null);

// App-wide full-screen media: one video "screening room" and one podcast
// player, so any tab can open either the same way.
export function MediaProvider({ children }) {
  const player = usePlayer();
  const { isPlaying, pause } = player;
  const [screening, setScreening] = useState(null);
  const [podcastId, setPodcastId] = useState(null);

  const openVideo = useCallback(
    (next) => {
      // Never talk over the film: audio pauses when a video starts.
      if (isPlaying) pause();
      setScreening(next);
    },
    [isPlaying, pause],
  );

  const openPodcast = useCallback(
    (podcast, { autoplay = true } = {}) => {
      const alreadyLoaded = player.current?.kind === 'podcast' && player.current.podcastId === podcast.id;
      if (autoplay && !alreadyLoaded) player.play(episodeItem(podcast, podcast.episodes[0]));
      setPodcastId(podcast.id);
    },
    [player],
  );

  const value = useMemo(
    () => ({
      openTrailer: (production) => openVideo({ production, kind: 'trailer' }),
      openEpisode: (production, episode = production.episodes[0]) => openVideo({ production, kind: 'episode', episode }),
      openPodcast,
      close: () => setScreening(null),
    }),
    [openVideo, openPodcast],
  );

  return (
    <MediaContext.Provider value={value}>
      {children}
      <ScreeningRoom screening={screening} onClose={value.close} onSwitch={setScreening} />
      {podcastId && <PodcastPlayer podcast={podcastById(podcastId)} onClose={() => setPodcastId(null)} />}
    </MediaContext.Provider>
  );
}

export function useMedia() {
  const ctx = useContext(MediaContext);
  if (!ctx) throw new Error('useMedia must be used inside <MediaProvider>');
  return ctx;
}
