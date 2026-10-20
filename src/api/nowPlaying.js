import axios from 'axios';

// "Now playing" before you press play. radio-browser doesn't carry track
// data, so ask the station's own streaming server through the public status
// endpoints the common server packages expose (CORS-enabled, so this also
// works on web). Roughly a third of stations answer one of these.

const TIMEOUT = 5000;
// origin -> strategy name that worked, or false if none did (retry later).
const strategyByOrigin = new Map();
const NEGATIVE_TTL_MS = 10 * 60 * 1000;

const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');

function compose(artist, title) {
  // Some servers put a track number or code in the artist field.
  const a = /^[\d\W]*$/.test(clean(artist)) ? '' : clean(artist);
  const t = clean(title);
  if (!t && !a) return null;
  if (!a || t.toLowerCase().includes(a.toLowerCase())) return t || a;
  return `${a} — ${t}`;
}

// Station IDs, jingles and "Unknown" placeholders aren't track info.
function plausible(text, station) {
  if (!text || text.length < 3) return null;
  const lower = text.toLowerCase();
  if (/^(unknown|untitled|n\/a|-|live|on air)$/.test(lower)) return null;
  if (station && lower === station.name.trim().toLowerCase()) return null;
  return text;
}

const STRATEGIES = {
  // AzuraCast: /listen/{station}/... -> /api/nowplaying/{station}
  async azuracast(url) {
    const m = /^\/listen\/([^/]+)\//.exec(url.pathname);
    if (!m) return undefined;
    const { data } = await axios.get(`${url.origin}/api/nowplaying/${m[1]}`, { timeout: TIMEOUT });
    const song = data?.now_playing?.song;
    return song ? compose(song.artist, song.title) || clean(song.text) : null;
  },
  // Icecast 2.4+: /status-json.xsl lists every mount on the server.
  async icecast(url) {
    const { data } = await axios.get(`${url.origin}/status-json.xsl`, { timeout: TIMEOUT });
    let sources = data?.icestats?.source;
    if (!sources) return undefined;
    sources = Array.isArray(sources) ? sources : [sources];
    const mount = sources.find((s) => {
      try {
        return new URL(s.listenurl).pathname === url.pathname;
      } catch {
        return false;
      }
    });
    const src = mount || (sources.length === 1 ? sources[0] : null);
    return src ? compose(src.artist, src.title || src.yp_currently_playing) : null;
  },
  // SHOUTcast v2: /stats?sid=1&json=1
  async shoutcast(url) {
    const { data } = await axios.get(`${url.origin}/stats`, { params: { sid: 1, json: 1 }, timeout: TIMEOUT });
    if (!data || typeof data !== 'object' || !('songtitle' in data)) return undefined;
    return clean(data.songtitle) || null;
  },
};

/**
 * Resolve the current track for a station, or null if its server doesn't
 * publish one. Never throws.
 */
export async function fetchNowPlaying(station) {
  let url;
  try {
    url = new URL(station.streamUrl);
  } catch {
    return null;
  }
  const known = strategyByOrigin.get(url.origin);
  if (known && known.name === false && Date.now() - known.at < NEGATIVE_TTL_MS) return null;

  const order = known?.name ? [known.name] : Object.keys(STRATEGIES);
  for (const name of order) {
    try {
      const result = await STRATEGIES[name](url);
      if (result === undefined) continue; // not this kind of server
      strategyByOrigin.set(url.origin, { name, at: Date.now() });
      return plausible(result, station);
    } catch {
      // try the next server type
    }
  }
  strategyByOrigin.set(url.origin, { name: false, at: Date.now() });
  return null;
}
