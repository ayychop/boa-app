import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { isOffline } from './network';

/**
 * Offline downloads: audio (podcast episodes) and video (Originals episodes
 * that are published as a file), saved to the phone and played from there.
 *
 *  - Files live in the app's document folder (`downloads/`), which Android
 *    doesn't clear the way it clears the cache. A download goes to
 *    `<name>.part` and is moved into place only once whole, so a file in the
 *    folder is always complete.
 *  - The list (what, where, how big) is kept in AsyncStorage
 *    (`boa.downloads.v1`); only finished downloads are kept, an interrupted
 *    one starts over.
 *  - Two download at once, the rest wait their turn. Progress is throttled so
 *    a fast connection doesn't flood the UI.
 *  - `localUriFor(id)` is how playback finds a downloaded file (the audio
 *    engine and the video player both ask it before streaming).
 *
 * Live radio stations can't be downloaded (they never end): only on-demand
 * audio and video are.
 */

const KEY = 'boa.downloads.v1';
const FOLDER = 'downloads';
const MAX_PARALLEL = 2;
const PROGRESS_STEP_MS = 120;

export const supported = Platform.OS !== 'web';

let entries = {}; // id -> entry (replaced, never mutated, so hooks can compare)
let snapshot = []; // the same, as a list: newest first
const listeners = new Set();
const jobs = new Map(); // id -> AbortController
const waiting = []; // ids queued for a turn
let running = 0;
let loading = null;

function commit(persist = false) {
  snapshot = Object.values(entries).sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
  listeners.forEach((fn) => fn());
  if (persist) {
    const done = snapshot.filter((e) => e.status === 'done');
    AsyncStorage.setItem(KEY, JSON.stringify(done)).catch(() => {});
  }
}

function patch(id, change, persist = false) {
  if (!entries[id]) return;
  entries = { ...entries, [id]: { ...entries[id], ...change } };
  commit(persist);
}

function drop(id, persist = true) {
  if (!entries[id]) return;
  const { [id]: _gone, ...rest } = entries;
  entries = rest;
  commit(persist);
}

function folder() {
  const dir = new Directory(Paths.document, FOLDER);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

const safe = (id) => String(id).replace(/[^a-zA-Z0-9._-]/g, '_');

const MEDIA_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|mp4|m4v|mov|webm|mkv)$/i;
function extFor(url, kind) {
  try {
    const path = new URL(url).pathname;
    const hit = path.match(MEDIA_EXT);
    if (hit) return hit[1].toLowerCase();
  } catch {}
  return kind === 'video' ? 'mp4' : 'mp3';
}

/** Whether a link is a plain file that can be saved (not a stream, nor a YouTube page). */
export function isDownloadable(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
  if (/\.(m3u8|mpd|pls|m3u)(\?|$)/i.test(url)) return false;
  if (/(^|\/\/|\.)(youtube\.com|youtu\.be)(\/|$)/i.test(url)) return false;
  return true;
}

/** Loads the saved list (once), dropping any whose file has gone, and clears half-finished files. */
export function ready() {
  if (!loading) {
    loading = (async () => {
      if (!supported) return;
      try {
        const saved = JSON.parse((await AsyncStorage.getItem(KEY)) || '[]');
        const dir = folder();
        const kept = {};
        for (const e of Array.isArray(saved) ? saved : []) {
          if (e?.id && e.status === 'done' && e.file && new File(dir, e.file).exists) kept[e.id] = e;
        }
        // Anything the user started before the app was closed starts over; its leftovers go.
        try {
          for (const f of dir.list?.() ?? []) if (/\.part$/.test(f.name ?? f.uri ?? '')) f.delete();
        } catch {}
        // What was started while this loaded stays.
        entries = { ...kept, ...entries };
        commit(Object.keys(kept).length !== (Array.isArray(saved) ? saved.length : 0));
      } catch (err) {
        console.warn('[downloads] couldn\'t read the list', err?.message ?? err);
      }
    })();
  }
  return loading;
}

// Read the saved list as soon as the app starts, so playback can find a
// downloaded file the moment it is asked for.
ready();

export const subscribe = (fn) => {
  listeners.add(fn);
  ready();
  return () => listeners.delete(fn);
};

export const getDownloads = () => snapshot;
export const getDownload = (id) => (id ? entries[id] ?? null : null);

/** Every download, newest first (re-renders when any changes). */
export function useDownloads() {
  return useSyncExternalStore(subscribe, getDownloads, getDownloads);
}

/** One download by id, or null (re-renders as its progress moves). */
export function useDownload(id) {
  return useSyncExternalStore(
    subscribe,
    () => getDownload(id),
    () => null,
  );
}

/** The local file of a finished download, or null. */
export function localUriFor(id) {
  const e = getDownload(id);
  if (!supported || !e || e.status !== 'done' || !e.file) return null;
  try {
    const file = new File(folder(), e.file);
    if (file.exists) return file.uri;
  } catch {}
  // The file has gone (storage cleared): forget it (after this call, which may be mid-render).
  Promise.resolve().then(() => drop(id));
  return null;
}

/** Total bytes of the finished downloads. */
export const usedBytes = () => snapshot.reduce((sum, e) => sum + (e.status === 'done' ? e.bytes || 0 : 0), 0);

/** "12.4 MB", "830 KB". */
export function formatBytes(n) {
  if (!n || n < 1) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/**
 * Queues a download. `spec`: { id, kind: 'audio' | 'video', title, subtitle,
 * url, image (a link, optional), meta (what is needed to play it again) }.
 * Returns { ok: true } or { ok: false, reason: 'offline' | 'unavailable' | 'unsupported' }.
 */
export async function startDownload(spec) {
  if (!supported) return { ok: false, reason: 'unsupported' };
  await ready();
  const { id } = spec ?? {};
  if (!id) return { ok: false, reason: 'unavailable' };
  const now = entries[id];
  if (now && (now.status === 'done' || now.status === 'queued' || now.status === 'downloading')) return { ok: true };
  if (!isDownloadable(spec.url)) return { ok: false, reason: 'unavailable' };
  if (isOffline()) return { ok: false, reason: 'offline' };
  entries = {
    ...entries,
    [id]: {
      id,
      kind: spec.kind === 'video' ? 'video' : 'audio',
      title: spec.title ?? 'Untitled',
      subtitle: spec.subtitle ?? '',
      url: spec.url,
      image: typeof spec.image === 'string' ? spec.image : null,
      meta: spec.meta ?? {},
      status: 'queued',
      progress: 0,
      bytes: 0,
      addedAt: Date.now(),
    },
  };
  commit();
  waiting.push(id);
  pump();
  return { ok: true };
}

function pump() {
  while (running < MAX_PARALLEL && waiting.length) {
    const id = waiting.shift();
    if (entries[id]?.status === 'queued') run(id);
  }
}

async function run(id) {
  running += 1;
  const controller = new AbortController();
  jobs.set(id, controller);
  patch(id, { status: 'downloading', progress: 0, error: undefined });
  const e = entries[id];
  const name = `${safe(id)}.${extFor(e.url, e.kind)}`;
  let part = null;
  try {
    const dir = folder();
    const dest = new File(dir, name);
    part = new File(dir, `${name}.part`);
    if (part.exists) part.delete();
    let last = 0;
    await File.downloadFileAsync(e.url, part, {
      idempotent: true,
      signal: controller.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        const t = Date.now();
        if (t - last < PROGRESS_STEP_MS) return;
        last = t;
        // totalBytes is -1 when the server doesn't say how big it is.
        patch(id, { progress: totalBytes > 0 ? Math.min(0.99, bytesWritten / totalBytes) : 0, bytes: bytesWritten, indeterminate: !(totalBytes > 0) });
      },
    });
    if (controller.signal.aborted) throw new Error('cancelled');
    if (!part.exists || !part.size) throw new Error('empty download');
    if (dest.exists) dest.delete();
    await part.move(dest);
    patch(id, { status: 'done', progress: 1, bytes: dest.size || part.size || 0, file: name, indeterminate: false, finishedAt: Date.now() }, true);
    // The cover too, so the list still has pictures with no signal (best effort).
    saveArt(id, e.image, dir);
  } catch (err) {
    try {
      if (part?.exists) part.delete();
    } catch {}
    // A cancel already removed the entry; anything else is shown with a retry.
    if (entries[id] && !controller.signal.aborted) {
      patch(id, { status: 'error', error: err?.message ?? 'Download failed', indeterminate: false });
    }
  } finally {
    jobs.delete(id);
    running -= 1;
    pump();
  }
}

async function saveArt(id, url, dir) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return;
  try {
    const art = new File(dir, `${safe(id)}.art`);
    await File.downloadFileAsync(url, art, { idempotent: true });
    if (art.exists && art.size && entries[id]) patch(id, { art: art.uri }, true);
  } catch {}
}

/** Stops one in progress (or waiting) and forgets it. */
export function cancelDownload(id) {
  const i = waiting.indexOf(id);
  if (i >= 0) waiting.splice(i, 1);
  jobs.get(id)?.abort();
  drop(id, false);
}

/** Deletes a finished download's file, to free the space. */
export function removeDownload(id) {
  const e = entries[id];
  if (!e) return;
  if (e.status === 'queued' || e.status === 'downloading') return cancelDownload(id);
  try {
    for (const name of [e.file, `${safe(id)}.art`]) {
      if (!name) continue;
      const f = new File(folder(), name);
      if (f.exists) f.delete();
    }
  } catch (err) {
    console.warn('[downloads] couldn\'t delete the file', err?.message ?? err);
  }
  drop(id);
}

/** Deletes every download. */
export function removeAllDownloads() {
  Object.keys(entries).forEach(removeDownload);
}

/** Tests only: forget everything in memory. */
export function __reset() {
  jobs.forEach((c) => c.abort());
  jobs.clear();
  waiting.length = 0;
  running = 0;
  entries = {};
  snapshot = [];
  loading = null;
  listeners.forEach((fn) => fn());
}
