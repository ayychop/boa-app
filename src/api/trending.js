import { supabase } from '../lib/supabase';
import { STATIONS_BY_GENRE } from '../data/radioStations';
import { GENRES } from './radio';

// "Trending on BOA Radio": the stations BOA's admins pick, in their order
// (supabase/migrations/20261025120000_trending_radio.sql). Anyone can read
// the list; only admins can change it (the database checks).

function need() {
  if (!supabase) throw new Error('Trending radio is not connected yet.');
  return supabase;
}

/** The picked stations, in order, ready to play. Empty if there are none. */
export async function listTrending() {
  const { data, error } = await need().from('trending_stations').select('station_id, station, position').order('position', { ascending: true }).order('added_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ ...row.station, id: row.station_id, kind: 'radio' }));
}

/**
 * BOA's curated stations across every genre, each once, with its genre:
 * what an admin chooses from.
 */
export function catalogue() {
  const seen = new Set();
  const out = [];
  for (const { tag, label } of GENRES) {
    for (const station of STATIONS_BY_GENRE[tag] ?? []) {
      if (seen.has(station.id)) continue;
      seen.add(station.id);
      out.push({ ...station, genre: tag, genreLabel: label });
    }
  }
  return out;
}

// What's kept of a station: enough to show and play it.
const KEEP = ['kind', 'id', 'name', 'streamUrl', 'logo', 'homepage', 'country', 'countryCode', 'tags', 'codec', 'bitrate', 'genre', 'genreLabel'];
const snapshot = (station) => Object.fromEntries(KEEP.filter((k) => station[k] != null).map((k) => [k, station[k]]));

/** Admins: adds a station to the end of the trending list. */
export async function addTrending(station, position) {
  const { error } = await need().from('trending_stations').insert({ station_id: station.id, station: snapshot(station), position });
  if (error) throw new Error(error.message);
}

/** Admins: takes a station off the trending list. */
export async function removeTrending(stationId) {
  const { error } = await need().from('trending_stations').delete().eq('station_id', stationId);
  if (error) throw new Error(error.message);
}

/** Admins: saves a new order (an array of station ids, first first). */
export async function reorderTrending(ids) {
  const sb = need();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await sb.from('trending_stations').update({ position: i }).eq('station_id', ids[i]);
    if (error) throw new Error(error.message);
  }
}
