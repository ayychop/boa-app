// "What's New": the notes shown once after an update (components/WhatsNewModal.js).
//
// To announce a release, bump `version` and replace `notes`. Everyone who
// opens the app on a build with a version they haven't seen gets the
// modal once; a fresh install skips it (they get the vibe check and the
// welcome tour instead).

export type PatchNote = {
  /** An Ionicons name. */
  icon: string;
  title: string;
  body: string;
};

export const WHATS_NEW: { version: string; headline: string; notes: PatchNote[] } = {
  version: '1.1.0',
  headline: 'Fresh in BOA HUB',
  notes: [
    {
      icon: 'car-sport',
      title: 'BOA Radio in your car',
      body: 'Android Auto support: browse stations by genre on the car screen and control playback from the wheel.',
    },
    {
      icon: 'sparkles',
      title: 'A welcome tour',
      body: 'New to the Hub? A quick, swipeable tour of Radio, Originals, Zen Mode, the Creative Hub and the Casting Board.',
    },
    {
      icon: 'videocam',
      title: 'Video calls',
      body: 'Face to face with anyone on the Hub, with Skin Smoothing and Tone Enhancer filters.',
    },
    {
      icon: 'pulse',
      title: 'Hi-Fi audio',
      body: 'Bass, treble and spatial sound on every station with BOA Premium.',
    },
  ],
};

/** Where the last version seen is kept on the phone. */
export const LAST_SEEN_KEY = 'boa.whatsNew.lastSeen';

/**
 * Whether to show the notes: a version this phone hasn't seen yet. With
 * nothing stored, only an existing listener (not a fresh install) sees them.
 */
export function shouldShowWhatsNew(lastSeen: string | null, version: string, freshInstall: boolean): boolean {
  if (lastSeen == null) return !freshInstall;
  return lastSeen !== version;
}
