import { supabase } from '../lib/supabase';

// Hype (supabase/migrations: station_reactions): a fire on a radio station,
// from the car's now playing screen. Distinct from a favourite. The
// database keeps who hyped what private and counts one fire per person per
// station a day; everyone sees the totals, which rank Trending on Home.

const DAY_MS = 24 * 60 * 60 * 1000;

/** The stations you've hyped in the last day: a Set of station ids. */
export async function myRecentHype(userId, now = Date.now()) {
  if (!supabase || !userId) return new Set();
  const { data, error } = await supabase
    .from('station_reactions')
    .select('station_id')
    .eq('user_id', userId)
    .eq('reaction_type', 'fire')
    .gt('created_at', new Date(now - DAY_MS).toISOString());
  return error ? new Set() : new Set((data ?? []).map((r) => r.station_id));
}

/** A fire on a station. Resolves either way: a second fire the same day is refused by the database and simply doesn't count. */
export async function hypeStation(stationId) {
  if (!supabase) return false;
  const { error } = await supabase.from('station_reactions').insert({ station_id: String(stationId), reaction_type: 'fire' });
  return !error;
}

/** Hype per station over the last week: a Map of station id to count. Empty if the database is behind. */
export async function stationHype(days = 7) {
  if (!supabase) return new Map();
  const { data, error } = await supabase.rpc('station_hype', { days });
  return error ? new Map() : new Map((data ?? []).map((r) => [r.station_id, Number(r.hype) || 0]));
}

/** How many hyped curated stations can join the admins' picks on Home. */
export const HYPED_EXTRAS = 3;

/**
 * Trending with Hype: the admins' picks plus up to HYPED_EXTRAS hyped
 * stations from BOA's curated catalogue (tested streams only), most hyped
 * first. Ties, and stations with no hype, keep the admins' order. Each
 * station carries its `hype` count.
 */
export function rankByHype(picked, hype, catalogue = []) {
  const ids = new Set(picked.map((s) => s.id));
  const extras = catalogue
    .filter((s) => !ids.has(s.id) && (hype.get(s.id) ?? 0) > 0)
    .sort((a, b) => hype.get(b.id) - hype.get(a.id))
    .slice(0, HYPED_EXTRAS);
  return [...picked, ...extras]
    .map((s, i) => ({ station: { ...s, hype: hype.get(s.id) ?? 0 }, i }))
    .sort((a, b) => b.station.hype - a.station.hype || a.i - b.i)
    .map((x) => x.station);
}
