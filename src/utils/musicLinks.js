import { Linking } from 'react-native';
import { splitTrack } from './track';

// Music discovery from the Radio player. Each opens the app if it's
// installed (its own URL scheme) and falls back to the website, which on a
// phone with the app installed usually opens the app anyway. openURL
// rejects when nothing can handle a scheme, which is what triggers the
// fallback, so no canOpenURL (and no Android <queries>) is needed.
async function openFirst(urls) {
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return url;
    } catch {}
  }
  return null;
}

export const SHAZAM_APP = 'shazam://';
export const SHAZAM_WEB = 'https://www.shazam.com/';

/** Opens Shazam to identify what's playing. */
export function openShazam() {
  return openFirst([SHAZAM_APP, SHAZAM_WEB]);
}

/** The search for a track: "Artist Title", or the text as it came. */
export function searchQuery(track) {
  const parts = splitTrack(track);
  return parts ? `${parts.artist} ${parts.title}` : (track || '').trim();
}

/** Searches YouTube Music for the track. */
export function openYouTubeMusic(track) {
  const q = encodeURIComponent(searchQuery(track));
  return openFirst([`youtubemusic://search?q=${q}`, `https://music.youtube.com/search?q=${q}`]);
}
