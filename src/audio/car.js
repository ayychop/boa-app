import * as engine from './engine';
import * as auto from '../../modules/boa-auto';
import { STATIONS_BY_GENRE } from '../data/radioStations';
import { GENRES } from '../api/radio';

// BOA Radio in the car (Android Auto). The car browses the curated stations
// by genre (modules/boa-auto); a tap there comes back here and plays
// through the app's own engine, exactly as a tap in the Radio tab would, so
// the phone, its lock screen and the car all show the same station.
//
// The car can connect with the app closed. Then JS starts without any
// screens, so there's no PlayerProvider yet: this plays through the engine
// directly and remembers the station and its genre, and the provider picks
// them up when the app is opened (takeBoot).

let player = null; // { play(item, list), next, previous } from PlayerContext
let boot = null; // { item, list } played before the app was opened
let started = false;
let lastSent = null;

/** The car's station browser: one folder per curated genre. */
export function catalogue() {
  return {
    folders: GENRES.filter((g) => STATIONS_BY_GENRE[g.tag]?.length).map((g) => ({
      id: `genre:${g.tag}`,
      title: g.label,
      stations: STATIONS_BY_GENRE[g.tag].map((s) => ({
        id: s.id,
        name: s.name,
        subtitle: s.country || g.label,
        logo: s.logo || null,
      })),
    })),
  };
}

/** A station by id, with the genre it's in (its next/previous queue). */
export function findStation(id) {
  if (!id) return null;
  for (const g of GENRES) {
    const list = STATIONS_BY_GENRE[g.tag] ?? [];
    const item = list.find((s) => s.id === id);
    if (item) return { item, list };
  }
  return null;
}

function play(item, list) {
  if (player) return player.play(item, list);
  boot = { item, list: list ?? boot?.list ?? [] };
  engine.play(item);
}

// Next/previous before the app has been opened: through the genre.
function step(delta) {
  if (player) return delta > 0 ? player.next() : player.previous();
  const playing = engine.getCurrent();
  const list = boot?.list ?? [];
  if (playing?.kind !== 'radio' || list.length < 2) return;
  const i = list.findIndex((s) => s.id === playing.id);
  play(list[(Math.max(i, 0) + delta + list.length) % list.length], list);
}

/** One tap on the car screen: { action, mediaId }. Exported for the tests. */
export function handle({ action, mediaId } = {}) {
  switch (action) {
    case 'catalogue':
      return auto.setCatalogue(catalogue());
    case 'play': {
      const found = findStation(mediaId);
      if (found) return play(found.item, found.list);
      // Not a curated station (one from Trending or a search): if it's the
      // one loaded, carry on with it.
      const playing = engine.getCurrent();
      if (playing?.id === mediaId) return play(playing);
      return;
    }
    case 'resume': {
      const playing = engine.getCurrent();
      if (playing) return play(playing);
      const found = findStation(mediaId) ?? findStation(catalogue().folders[0]?.stations[0]?.id);
      if (found) play(found.item, found.list);
      return;
    }
    case 'pause':
      return engine.pause();
    case 'next':
      return step(1);
    case 'previous':
      return step(-1);
    default:
  }
}

// What's on, for the car's now playing screen.
function sync(state) {
  const item = engine.getCurrent();
  const meta = item ? engine.lockScreenMetadata?.(item) : null;
  const next = {
    status: item ? state.status : 'idle',
    mediaId: item?.id ?? null,
    title: meta?.title ?? item?.name ?? null,
    artist: meta?.artist ?? null,
    artwork: meta?.artworkUrl ?? item?.logo ?? null,
    canStep: item?.kind === 'radio' && (player ? player.canStep() : (boot?.list?.length ?? 0) > 1),
  };
  const key = JSON.stringify(next);
  if (key === lastSent) return;
  lastSent = key;
  auto.setPlayback(next);
}

/** Connects the car to the engine. Called once, as JS starts (index.js). */
export function start() {
  if (started || !auto.isAvailable) return;
  started = true;
  auto.setCatalogue(catalogue());
  auto.addCommandListener(handle);
  engine.subscribe(sync);
  // Lock screen and headset next/previous, until the app's own take over.
  engine.setRemoteControls({ next: () => step(1), previous: () => step(-1) });
}

/**
 * The player context, once the app is open: the car's taps go through it,
 * so the Radio tab and mini player follow. Returns a detach.
 */
export function attachPlayer(handlers) {
  player = handlers;
  return () => {
    if (player === handlers) player = null;
  };
}

/** What the car played before the app was opened, once (PlayerContext). */
export function takeBoot() {
  const b = boot;
  boot = null;
  return b;
}

/** Test hook: forget everything. */
export function reset() {
  player = null;
  boot = null;
  started = false;
  lastSent = null;
}
