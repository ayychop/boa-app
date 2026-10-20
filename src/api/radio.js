import axios from 'axios';
import { Platform } from 'react-native';

// radio-browser.info asks clients to pick a mirror from the live server list
// rather than hard-coding one. These are only used if that lookup fails.
const FALLBACK_SERVERS = [
  'https://de1.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
  'https://fi1.api.radio-browser.info',
];

const PROBE_TIMEOUT_MS = 5000;
const PROBE_CONCURRENCY = 8;

let serversPromise = null;
let preferred = null;

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getServers() {
  if (!serversPromise) {
    serversPromise = axios
      .get('https://all.api.radio-browser.info/json/servers', { timeout: 4000 })
      .then(({ data }) => {
        const hosts = [...new Set(data.map((s) => `https://${s.name}`))];
        if (!hosts.length) throw new Error('empty server list');
        return shuffle(hosts);
      })
      .catch(() => {
        // Let the next call retry the lookup.
        serversPromise = null;
        return shuffle(FALLBACK_SERVERS);
      });
  }
  return serversPromise;
}

// Mirrors go down independently, so try each until one answers and stick
// with it for later requests.
async function apiGet(path, config) {
  const servers = await getServers();
  const order = preferred ? [preferred, ...servers.filter((s) => s !== preferred)] : servers;
  let lastError;
  for (const base of order) {
    try {
      const res = await axios.get(`${base}${path}`, { timeout: 8000, ...config });
      preferred = base;
      return res;
    } catch (err) {
      if (axios.isCancel(err)) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

function hasValidStreamUrl(station) {
  const url = station.url_resolved;
  if (!url || typeof url !== 'string') return false;
  // HTTPS only: cleartext streams are blocked by default on iOS/Android and
  // by mixed-content rules on web.
  if (!/^https:\/\/[^\s]+$/i.test(url)) return false;
  // HLS carries track info as ID3 tags, not ICY metadata, so we can't
  // confirm now-playing support with a header probe.
  if (station.hls === 1) return false;
  return station.lastcheckok === 1;
}

/**
 * Ask the stream for ICY metadata and resolve true if the server announces an
 * `icy-metaint` interval, i.e. it interleaves StreamTitle (current track) data.
 *
 * Uses XMLHttpRequest because RN's fetch only resolves once the body finishes,
 * which never happens for a live stream. We abort as soon as headers arrive.
 */
function probeIcyMetadata(url) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        xhr.abort();
      } catch {}
      resolve(result);
    };
    const timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);

    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 2) {
        const ok = xhr.status >= 200 && xhr.status < 400;
        finish(ok && !!xhr.getResponseHeader('icy-metaint'));
      }
    };
    xhr.onerror = () => finish(false);

    try {
      xhr.open('GET', url);
      xhr.setRequestHeader('Icy-MetaData', '1');
      xhr.send();
    } catch {
      finish(false);
    }
  });
}

// Probe in popularity order, a few at a time, and stop launching new probes
// once enough stations have passed.
async function takeVerified(candidates, limit, check) {
  const passed = new Array(candidates.length).fill(false);
  let next = 0;
  let count = 0;
  const workers = Array.from({ length: Math.min(PROBE_CONCURRENCY, candidates.length) }, async () => {
    while (next < candidates.length && count < limit) {
      const i = next++;
      if (await check(candidates[i])) {
        passed[i] = true;
        count++;
      }
    }
  });
  await Promise.all(workers);
  return candidates.filter((_, i) => passed[i]).slice(0, limit);
}

function normalize(station, metadataVerified) {
  return {
    id: station.stationuuid,
    name: station.name.trim(),
    streamUrl: station.url_resolved,
    logo: station.favicon || null,
    homepage: station.homepage || null,
    country: station.country || null,
    countryCode: station.countrycode || null,
    tags: station.tags ? station.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    codec: station.codec || null,
    bitrate: station.bitrate || null,
    votes: station.votes,
    metadataVerified,
  };
}

// Home's "Trending" row and the Radio tab ask for the same genre; share one
// request (and its metadata probes) instead of doing the work twice.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

/**
 * Fetch stations for a genre tag, keeping only ones with a usable
 * `url_resolved` stream that broadcast current-track (ICY) metadata.
 *
 * Browsers can't read the stream's `icy-metaint` header (CORS blocks the
 * custom request header and the response header isn't exposed), so on web the
 * probe is skipped by default and stations come back with
 * `metadataVerified: false`. On iOS/Android the probe runs and unverified
 * stations are dropped.
 *
 * @param {string} tag e.g. "afrobeats", "hip hop"
 * @param {{ limit?: number, verifyMetadata?: boolean, signal?: AbortSignal }} [options]
 */
export function fetchStationsByTag(tag, options = {}) {
  const { limit = 30, verifyMetadata = Platform.OS !== 'web' } = options;
  const key = `${tag.trim().toLowerCase()}|${limit}|${verifyMetadata}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;
  const promise = loadStations(tag, options).catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

async function loadStations(tag, options) {
  const { limit = 30, verifyMetadata = Platform.OS !== 'web', signal } = options;
  const { data } = await apiGet('/json/stations/search', {
    params: {
      tag: tag.trim().toLowerCase(),
      tagExact: false,
      hidebroken: true,
      order: 'clickcount',
      reverse: true,
      // Over-fetch: many stations fall out at the filtering steps below.
      limit: limit * 4,
    },
    signal,
  });

  const seen = new Set();
  const candidates = data.filter((s) => {
    if (!hasValidStreamUrl(s)) return false;
    // Directories often list the same station more than once, sometimes
    // under different stream URLs.
    const nameKey = s.name.trim().toLowerCase();
    if (seen.has(s.url_resolved) || seen.has(nameKey)) return false;
    seen.add(s.url_resolved);
    seen.add(nameKey);
    return true;
  });

  if (!verifyMetadata) {
    return candidates.slice(0, limit).map((s) => normalize(s, !!s.has_extended_info));
  }

  const verified = await takeVerified(
    candidates,
    limit,
    async (s) => s.has_extended_info || (await probeIcyMetadata(s.url_resolved)),
  );
  return verified.map((s) => normalize(s, true));
}

export const GENRES = [
  { tag: 'afrobeats', label: 'Afrobeats' },
  { tag: 'hip hop', label: 'Hip Hop' },
  { tag: 'rnb', label: 'R&B' },
  { tag: 'amapiano', label: 'Amapiano' },
  { tag: 'dancehall', label: 'Dancehall' },
  { tag: 'reggae', label: 'Reggae' },
  { tag: 'jazz', label: 'Jazz' },
  { tag: 'gospel', label: 'Gospel' },
];
