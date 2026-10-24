/**
 * "Artist - Title" (hyphen or en dash) split into its parts, or null when a
 * station's text isn't in that shape (a show name, a slogan).
 */
export function splitTrack(text) {
  const m = /^\s*(.+?)\s+[-–]\s+(.+?)\s*$/.exec(text || '');
  return m ? { artist: m[1], title: m[2] } : null;
}
