import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as engine from '../audio/engine';
import { haptics } from '../utils/haptics';
import useNowPlaying from '../hooks/useNowPlaying';
import * as widget from '../../modules/boa-widget';

const PlayerContext = createContext(null);
// Position ticks several times a second; keep it in its own context so only
// scrubbers and progress bars re-render, not the whole app.
const ProgressContext = createContext({ position: 0, duration: 0 });

export function PlayerProvider({ children }) {
  // What's loaded: a radio station or a podcast episode (see audio/engine.js).
  const [current, setCurrent] = useState(null);
  const [core, setCore] = useState({ status: 'idle', title: null, rate: 1, retry: 0 });
  const [progress, setProgress] = useState({ position: 0, duration: 0 });

  useEffect(
    () =>
      engine.subscribe((s) => {
        setCore((c) =>
          c.status === s.status && c.title === s.title && c.rate === s.rate && c.retry === s.retry
            ? c
            : { status: s.status, title: s.title, rate: s.rate, retry: s.retry || 0 },
        );
        setProgress((p) => (p.position === s.position && p.duration === s.duration ? p : { position: s.position, duration: s.duration }));
      }),
    [],
  );

  // The list the current station was played from (the radio carousel,
  // Home's trending row, your library), as it was at that moment, so
  // next/previous step through a stable order even if the list on screen
  // changes later.
  const queue = useRef([]);
  const currentRef = useRef(null);
  currentRef.current = current;

  const start = useCallback((item) => {
    setCurrent(item);
    engine.play(item);
  }, []);

  // Every play/pause is a user action, so each gets one light tap. Pass the
  // list it came from to make it the queue for next/previous.
  const play = useCallback(
    (item, list) => {
      haptics.tap();
      if (list?.length) queue.current = list.filter((s) => s.kind === 'radio');
      start(item);
    },
    [start],
  );

  // Next/previous station, from the lock screen, notification, headset or
  // car: wraps round the queue. Only for live radio.
  // Zen Mode's own controls use the same steps.
  const step = useCallback(
    (delta) => {
      const playing = currentRef.current;
      const list = queue.current;
      if (playing?.kind !== 'radio' || list.length < 2) return;
      const i = list.findIndex((s) => s.id === playing.id);
      start(list[(Math.max(i, 0) + delta + list.length) % list.length]);
    },
    [start],
  );
  const next = useCallback(() => step(1), [step]);
  const previous = useCallback(() => step(-1), [step]);
  useEffect(() => {
    engine.setRemoteControls({ next, previous });
    return () => engine.setRemoteControls(null);
  }, [next, previous]);

  const pause = useCallback(() => {
    haptics.tap();
    engine.pause();
  }, []);

  const isPlaying = core.status === 'playing' || core.status === 'loading';

  // What the station says is on, passed to the lock screen as the title.
  const polledTrack = useNowPlaying(current, current?.kind === 'radio');
  const track = core.title || polledTrack;
  useEffect(() => {
    if (current?.kind === 'radio') engine.setNowPlaying(current.id, track);
  }, [current, track]);

  // The home screen widget shows the station, the song (or "Paused") and
  // the station's record; with nothing loaded, the BOA logo.
  useEffect(() => {
    if (!current) widget.setNowPlaying(null, null);
    else widget.setNowPlaying(current.name, isPlaying ? track || 'Live on BOA Radio' : 'Paused', current.id, isPlaying);
  }, [current, track, isPlaying]);

  // Tapping a record or cover: pause it if it's the one playing, else play
  // it (with the list it sits in as the queue).
  const toggle = useCallback(
    (target = current, list) => {
      if (!target) return;
      if (target.id === current?.id && isPlaying) pause();
      else play(target, list);
    },
    [current, isPlaying, play, pause],
  );

  const value = useMemo(
    () => ({
      current,
      status: core.status,
      trackTitle: core.title,
      rate: core.rate,
      // Background reconnect attempt in progress (1..MAX_RETRIES), else 0.
      retry: core.retry,
      isPlaying,
      play,
      pause,
      toggle,
      next,
      previous,
      // Drift off: fades the audio out, then pauses (the sleep timer).
      fadeOut: engine.fadeOut,
      // Live radio with somewhere to step to.
      canStep: current?.kind === 'radio' && queue.current.length > 1,
      seek: engine.seek,
      skip: engine.skip,
      setRate: engine.setRate,
    }),
    [current, core, isPlaying, play, pause, toggle, next, previous],
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
