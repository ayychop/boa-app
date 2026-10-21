import axios from 'axios';
import { Image, Platform } from 'react-native';
import { CURATED_GHANA, CURATED_RNB_HIPHOP } from '../data/trendingStations';

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
 * Open the stream just long enough to read its response headers.
 * Resolves { ok, icy, audio }: a 2xx/3xx answer, whether the server announces
 * an `icy-metaint` interval (it interleaves StreamTitle, i.e. current-track,
 * data), and whether it says it's sending audio.
 *
 * Uses XMLHttpRequest because RN's fetch only resolves once the body finishes,
 * which never happens for a live stream. We abort as soon as headers arrive.
 */
function probeStream(url) {
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
    const timer = setTimeout(() => finish({ ok: false }), PROBE_TIMEOUT_MS);

    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 2) {
        const type = xhr.getResponseHeader('content-type') || '';
        finish({
          ok: xhr.status >= 200 && xhr.status < 400,
          icy: !!xhr.getResponseHeader('icy-metaint'),
          audio: /^(audio\/|application\/ogg)/i.test(type),
        });
      }
    };
    xhr.onerror = () => finish({ ok: false });

    try {
      xhr.open('GET', url);
      xhr.setRequestHeader('Icy-MetaData', '1');
      xhr.send();
    } catch {
      finish({ ok: false });
    }
  });
}

async function probeIcyMetadata(url) {
  const r = await probeStream(url);
  return r.ok && r.icy;
}

// Probe in popularity order, a few at a time, and stop launching new probes
// once enough stations have passed.
async function takeVerified(candidates, limit, check, concurrency = PROBE_CONCURRENCY) {
  const passed = new Array(candidates.length).fill(false);
  let next = 0;
  let count = 0;
  const workers = Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
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
    kind: 'radio',
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

// --- Tier 1: curated, guaranteed in-app streams ----------------------------

// Trending is music-only: R&B / Hip Hop, plus exactly one station from Ghana.
const RNB_TAGS = new Set(['rnb', 'r&b', 'r & b', 'r n b', 'rhythm and blues']);
const HIPHOP_TAGS = new Set(['hip hop', 'hiphop', 'hip-hop', 'rap']);
// Anything with these in its name or tags carries presenters or talk.
const TALK = /talk|news|sports?\b|radio show|podcast|dj set|live show/i;
// Tags that suggest continuous music; used to rank directory candidates.
const MUSIC_TAGS = new Set(['music', 'continuous music', 'non-stop', 'nonstop', 'automated', 'rnb', 'r&b', 'hip hop', 'hiphop', 'hip-hop', 'soul', 'urban']);
// Playback probes buffer real audio, so they run a few at a time: eight live
// streams loading at once (often on one host) starve each other and time out.
const TIER1_TIMEOUT_MS = 8000;
const TIER1_CONCURRENCY = 3;

const tagList = (station) => station.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
const isGhana = (station) => station.countrycode === 'GH';
const isRnbHipHop = (station) => {
  const tags = tagList(station);
  return tags.some((t) => RNB_TAGS.has(t)) && tags.some((t) => HIPHOP_TAGS.has(t));
};
const isMusicOnly = (station) => !TALK.test(`${station.name} ${station.tags}`);
const musicScore = (station) => tagList(station).filter((t) => MUSIC_TAGS.has(t)).length;

// Tier 1 judges the URL the app actually plays (url_resolved). Anything that
// is still a playlist (.m3u/.pls/...) or HLS there would need another hop or
// an external player, so it's a "deep link" stream and is skipped. A station
// whose directory link was a playlist that radio-browser already resolved to
// a direct MP3 is fine: we play the MP3, and probePlayback proves it.
function isTier1(station, { minBitrate = 128 } = {}) {
  if (!hasValidStreamUrl(station)) return false;
  if (/\.(m3u8?|pls|asx|xspf)(\?|$)/i.test(station.url_resolved)) return false;
  if (station.ssl_error) return false;
  // MP3 is the one codec every browser and both native players decode.
  if (station.codec !== 'MP3' || (station.bitrate || 0) < minBitrate) return false;
  // Keyword-stuffed directory names ("# TOP 100 CLUB CHARTS - ...").
  const name = station.name.trim();
  if (/^[\W_]/.test(name) || name.length > 40) return false;
  // Trending is the first thing people see: it needs real station artwork,
  // not a generated initials disc.
  return !!station.favicon;
}

// Web: let a real <audio> element prove the stream decodes and buffers.
function probePlayback(url) {
  return new Promise((resolve) => {
    const el = new window.Audio();
    let timer = null;
    const finish = (ok) => {
      clearTimeout(timer);
      el.oncanplay = el.onerror = null;
      el.removeAttribute('src');
      el.load();
      resolve(ok);
    };
    timer = setTimeout(() => finish(false), TIER1_TIMEOUT_MS);
    el.muted = true;
    el.preload = 'auto';
    el.oncanplay = () => finish(true);
    el.onerror = () => finish(false);
    el.src = url;
  });
}

// The listed logo has to actually load at a usable size. Dead links are
// common, and some point at YouTube thumbnails that come back as its 120x90
// grey "missing" placeholder.
function logoLoads(url) {
  const usable = (w, h) => w >= 64 && h >= 64 && !(w === 120 && h === 90);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), TIER1_TIMEOUT_MS);
    const done = (ok) => {
      clearTimeout(timer);
      resolve(ok);
    };
    if (Platform.OS === 'web') {
      const img = new window.Image();
      img.onload = () => done(usable(img.naturalWidth, img.naturalHeight));
      img.onerror = () => done(false);
      img.src = url;
    } else {
      Image.getSize(url, (w, h) => done(usable(w, h)), () => done(false));
    }
  });
}

async function playsInApp(station) {
  const [plays, logo] = await Promise.all([
    Platform.OS === 'web'
      ? probePlayback(station.url_resolved)
      : probeStream(station.url_resolved).then((r) => r.ok && (r.audio || r.icy)),
    logoLoads(station.favicon),
  ]);
  return plays && logo;
}

async function search(params) {
  const { data } = await apiGet('/json/stations/search', {
    params: { hidebroken: true, order: 'votes', reverse: true, limit: 60, ...params },
  });
  return data;
}

// Curated picks resolved to live directory records, in list order. They were
// vetted from their song metadata rather than bitrate, so 96 kbps is allowed;
// everything else about Tier 1 still applies.
async function resolveCurated(list, genre) {
  const { data } = await apiGet('/json/stations/byuuid', { params: { uuids: list.map((c) => c.uuid).join(',') } });
  const byId = new Map(data.map((s) => [s.stationuuid, s]));
  return list
    .map((c) => byId.get(c.uuid) && { ...byId.get(c.uuid), favicon: c.logo ?? byId.get(c.uuid).favicon, _genre: genre })
    .filter((s) => s && isMusicOnly(s) && isTier1(s, { minBitrate: 96 }));
}

// Directory fallback when curated stations are down: same filters, ranked
// by music-signalling tags, then votes.
const rankForMusic = (list) => list.sort((a, b) => musicScore(b) - musicScore(a) || b.votes - a.votes);

async function loadTier1(limit) {
  const rnbWanted = limit - 1;
  const [curatedRnb, curatedGhana] = await Promise.all([
    resolveCurated(CURATED_RNB_HIPHOP, 'rnb').catch(() => []),
    resolveCurated(CURATED_GHANA, null).catch(() => []),
  ]);
  let [rnb, ghana] = await Promise.all([
    takeVerified(curatedRnb, rnbWanted, playsInApp, TIER1_CONCURRENCY),
    takeVerified(curatedGhana, 1, playsInApp, TIER1_CONCURRENCY),
  ]);

  const used = new Set([...rnb, ...ghana].map((s) => s.stationuuid));
  if (rnb.length < rnbWanted) {
    const tagged = await Promise.all(
      ['rnb', 'r&b', 'hip hop', 'hiphop', 'hip-hop'].map((tag) => search({ tag, tagExact: true }).catch(() => [])),
    );
    const pool = rankForMusic(
      [...new Map(tagged.flat().map((s) => [s.stationuuid, s])).values()].filter(
        (s) => !used.has(s.stationuuid) && isRnbHipHop(s) && isMusicOnly(s) && isTier1(s),
      ),
    ).map((s) => ({ ...s, _genre: 'rnb' }));
    const need = rnbWanted - rnb.length;
    rnb = rnb.concat(await takeVerified(pool.slice(0, need * 4), need, playsInApp, TIER1_CONCURRENCY));
  }
  if (!ghana.length) {
    const pool = rankForMusic((await search({ countrycode: 'GH' }).catch(() => [])).filter((s) => isGhana(s) && isMusicOnly(s) && isTier1(s)));
    ghana = await takeVerified(pool.slice(0, 8), 1, playsInApp, TIER1_CONCURRENCY);
  }

  // R&B / Hip Hop leads; the one Ghanaian station sits third.
  const row = [...rnb.slice(0, 2), ...ghana.slice(0, 1), ...rnb.slice(2)];
  return row.map((s) => ({ ...normalize(s, !!s.has_extended_info), genre: s._genre, tier: 1 }));
}

/**
 * Home's "Trending on BOA Radio": continuous-music stations only. R&B / Hip
 * Hop plus exactly one Ghanaian station, from a curated list (see
 * data/trendingStations.js) topped up from the directory, with talk-heavy
 * stations filtered out. Every one is test-played in-app, with working
 * artwork, before it's returned.
 */
export function fetchTier1Stations({ limit = 5 } = {}) {
  const key = `tier1|${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;
  const promise = loadTier1(limit).catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, { at: Date.now(), promise });
  return promise;
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
