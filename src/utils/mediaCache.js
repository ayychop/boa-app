import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { MEDIA_HEADERS } from '../data/sleep';

// Downloads a remote media file once into the app's cache (cache/<folder>/
// <name>) and hands back its local uri, so loops play from the phone
// instead of re-streaming: a night of white noise would be ~30 MB an hour,
// an 18-second video loop far more. If the download fails it returns the
// remote uri with the headers instead, so playback still works. The browser
// always streams.
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
      const file = new File(dir(folder), name);
      if (!file.exists || !file.size) await File.downloadFileAsync(uri, file, { headers: MEDIA_HEADERS, idempotent: true });
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
