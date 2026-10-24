import { useEffect, useState } from 'react';
import { fetchNowPlaying } from '../api/nowPlaying';

// Shared, polled "now playing" titles keyed by station id, so the Radio stage
// and the mini player show the same thing without double-fetching.
// Short enough that Song info (Shazam, YouTube Music) follows a new track
// within seconds of it starting.
const POLL_MS = 15000;
const titles = new Map(); // id -> string | null
const listeners = new Set();
const polls = new Map(); // id -> { count, timer }

function set(id, title) {
  if (titles.get(id) === title) return;
  titles.set(id, title);
  listeners.forEach((fn) => fn());
}

function start(station) {
  const entry = polls.get(station.id);
  if (entry) {
    entry.count++;
    return;
  }
  const tick = () => fetchNowPlaying(station).then((t) => set(station.id, t));
  tick();
  polls.set(station.id, { count: 1, timer: setInterval(tick, POLL_MS) });
}

function stop(id) {
  const entry = polls.get(id);
  if (!entry || --entry.count > 0) return;
  clearInterval(entry.timer);
  polls.delete(id);
}

/**
 * Current track for a radio station, or null if its server doesn't say.
 * Polls only while `active` (the record in focus, or what's playing).
 */
export default function useNowPlaying(station, active = true) {
  const id = station?.kind === 'radio' ? station.id : null;
  const [, rerender] = useState(0);

  useEffect(() => {
    const fn = () => rerender((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  useEffect(() => {
    if (!id || !active) return undefined;
    start(station);
    return () => stop(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, active]);

  return id ? titles.get(id) ?? null : null;
}
