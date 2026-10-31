import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { MEDIA_HEADERS } from '../data/sleep';

// Downloads a remote media file once into the app's cache (cache/<folder>/
// <name>) and hands back its local uri, so loops play from the phone
// instead of re-streaming: a night of white noise would be ~30 MB an hour,
// an 18-second video loop far more. If the download fails it returns the
// remote uri with the headers instead, so playback still works. The browser
// always streams.
//
// A download lands in `<name>.part` and is moved into place only when it has
// finished, so a file in the cache is always a whole one. (On Android a
// download that fails or is cut short, by the app being closed or the phone
// losing signal, leaves a partly written file at its destination; played as
// a video that is a corrupt stream the decoder can crash on, so the old
// "if it's there, it's good" check was not safe.)
const pending = new Map();

function dir(folder) {
  const d = new Directory(Paths.cache, folder);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

export function cachedSource(folder, name, uri) {
  if (Platform.OS === 'web') return Promise.resolve({ uri, headers: MEDIA_HEADERS });
  const key = `${folder}/${name}`;
  if (pending.has(key)) return pending.get(key);
  const job = (async () => {
    try {
      const folderDir = dir(folder);
      const file = new File(folderDir, name);
      if (!file.exists || !file.size) await download(folderDir, file, name, uri);
      return { uri: file.uri };
    } catch (err) {
      console.warn(`[media] couldn't cache ${key}, streaming instead`, err?.message ?? err);
      return { uri, headers: MEDIA_HEADERS };
    }
  })();
  pending.set(key, job);
  // Only the in-flight download is shared; a later call checks the cache again.
  job.finally(() => pending.delete(key));
  return job;
}

/** Downloads to `<name>.part`, then moves the finished file into place. */
async function download(folderDir, file, name, uri) {
  const part = new File(folderDir, `${name}.part`);
  if (part.exists) part.delete();
  try {
    await File.downloadFileAsync(uri, part, { headers: MEDIA_HEADERS, idempotent: true });
    if (!part.exists || !part.size) throw new Error('empty download');
    if (file.exists) file.delete();
    await part.move(file);
  } catch (err) {
    // Never leave half a file behind.
    try {
      if (part.exists) part.delete();
    } catch {}
    throw err;
  }
}

/**
 * Deletes one cached file (and any half-written copy): for a file a decoder
 * has refused, so the next time fetches a clean one instead of failing on the
 * same bytes for ever. Best effort.
 */
export function discard(folder, name) {
  if (Platform.OS === 'web') return;
  try {
    const d = dir(folder);
    for (const n of [name, `${name}.part`]) {
      const f = new File(d, n);
      if (f.exists) f.delete();
    }
  } catch {}
}

/** Removes files from the cache folder that fail `keep(name)`: old, unverified downloads. Best effort. */
export function sweep(folder, keep) {
  if (Platform.OS === 'web') return;
  try {
    const d = dir(folder);
    if (typeof d.list !== 'function') return;
    for (const entry of d.list()) {
      const name = String(entry.uri).split('/').pop();
      if (!keep(name)) {
        try {
          entry.delete();
        } catch {}
      }
    }
  } catch {}
}

/** The local uri if the file is already in the cache, else null. Synchronous. */
export function cachedUri(folder, name) {
  if (Platform.OS === 'web') return null;
  try {
    const file = new File(dir(folder), name);
    return file.exists && file.size ? file.uri : null;
  } catch {
    return null;
  }
}

/**
 * Downloads files into the cache one after another, in the background,
 * skipping any already there. Resolves when all are done; never rejects.
 */
export async function prefetch(items) {
  for (const { folder, name, uri } of items) {
    if (cachedUri(folder, name)) continue;
    await cachedSource(folder, name, uri);
  }
}
