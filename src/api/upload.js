import { Platform } from 'react-native';
import { File } from 'expo-file-system';

// Every avatar, post and chat file goes to Supabase Storage first; the
// database only ever holds the permanent https:// link (or, for private
// chat files, the storage path). A file:// or content:// path is only good
// on the phone that picked it, and is gone once the app is reinstalled.

/** Whether this is a permanent cloud link, never a file on this phone. */
export const isCloudUrl = (url) => typeof url === 'string' && /^https:\/\/[^\s]+$/i.test(url.trim());

/** Throws if a picture link about to be saved isn't a cloud link. */
export function assertCloudUrl(url, what = 'That photo') {
  if (url != null && !isCloudUrl(url)) throw new Error(`${what} hasn't finished uploading. Try again in a moment.`);
}

/**
 * A picked file's bytes, for uploading. On the phone it's read straight
 * from disk (file:// and Android's content:// both work), which is more
 * reliable for large videos than fetch(); fetch is the fallback, and what
 * the web uses.
 */
export async function readFileBytes(uri) {
  if (Platform.OS !== 'web' && /^(file|content):/i.test(uri ?? '')) {
    try {
      return await new File(uri).arrayBuffer();
    } catch {}
  }
  return (await fetch(uri)).arrayBuffer();
}
