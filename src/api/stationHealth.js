import { useEffect, useState } from 'react';
import { streamPlays } from './radio';

// Session-only record of stations that are down, so the Radio carousel can
// swap them out instead of letting people keep swiping into dead records.
// Nothing is persisted: a station that's down now may be back tomorrow.

const dead = new Set();
const checks = new Map(); // id -> Promise<boolean> (healthy?)
const listeners = new Set();
let version = 0;

function changed() {
  version += 1;
  listeners.forEach((fn) => fn(version));
}

export function markDead(id) {
  if (!id || dead.has(id)) return;
  dead.add(id);
  changed();
}

export function markAlive(id) {
  checks.set(id, Promise.resolve(true));
  if (dead.delete(id)) changed();
}

export const isDead = (id) => dead.has(id);

/**
 * Quietly test stations before the listener reaches them. Two failed probes
 * (a second try rules out a blip) and the station is marked dead. Each
 * station is checked at most once per session.
 */
export function checkAhead(stations) {
  for (const s of stations) {
    if (!s || s.kind !== 'radio' || checks.has(s.id) || dead.has(s.id)) continue;
    const check = streamPlays(s.streamUrl)
      .then((ok) => ok || streamPlays(s.streamUrl))
      .then((ok) => {
        if (!ok) markDead(s.id);
        return ok;
      })
      .catch(() => true);
    checks.set(s.id, check);
  }
}

/** Re-renders when the dead set changes; returns it. */
export function useDeadStations() {
  const [, setV] = useState(version);
  useEffect(() => {
    listeners.add(setV);
    return () => listeners.delete(setV);
  }, []);
  return dead;
}

/**
 * The list to show: dead stations replaced in place by the next unused
 * backup (or dropped when backups run out). `keepId` (the record on screen)
 * is never swapped out from under the listener, so they can still retry it.
 */
export function healList(stations, backups, keepId) {
  const used = new Set(stations.map((s) => s.id));
  const pool = backups.filter((b) => !dead.has(b.id) && !used.has(b.id));
  const out = [];
  for (const s of stations) {
    if (!dead.has(s.id) || s.id === keepId) out.push(s);
    else if (pool.length) out.push(pool.shift());
  }
  return out;
}
