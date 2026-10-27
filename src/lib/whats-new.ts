import Constants from 'expo-constants';
import * as Application from 'expo-application';

// "What's New": the notes shown once after an update (components/WhatsNewModal.js).
//
// An update is any build this phone hasn't opened before: the app's
// version (app.json, via expo-constants) plus its build number
// (expo-application). So a new version, or a new build number, shows the
// modal once. A fresh install skips it (they get the vibe check and the
// welcome tour instead). To announce a release, replace `notes` and bump
// `version` in app.json: preview builds keep the same build number.

export type PatchNote = {
  /** An Ionicons name. */
  icon: string;
  title: string;
  body: string;
};

export const WHATS_NEW: { headline: string; notes: PatchNote[] } = {
  headline: 'Fresh in BOA HUB',
  notes: [
    {
      icon: 'videocam',
      title: 'Video calls, redesigned',
      body: 'A floating glass dock with big, easy controls, flip camera, and Studio filters: Studio Lighting, Flawless HD, Tone Enhancer and Soft Glow.',
    },
    {
      icon: 'shield-checkmark',
      title: 'Privacy Mode',
      body: 'Turn off screenshots during a call. The other person sees that you have.',
    },
    {
      icon: 'color-palette',
      title: '12 chat vibes, and your own',
      body: 'From Turntable to The Block, or pick any colour with Custom. Make your bubbles yours in Chat Appearance.',
    },
    {
      icon: 'musical-notes',
      title: 'BOA ringtones',
      body: 'Hip Hop, R&B, Afrobeats or Bashment: choose what rings when someone calls.',
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

/** The installed app's version, as shown in the modal ("1.2.0"). */
export function appVersion(): string {
  return Constants.expoConfig?.version ?? Application.nativeApplicationVersion ?? '0.0.0';
}

/** This build, as stored: version and build number ("1.2.0+14"). */
export function currentRelease(): string {
  return `${appVersion()}+${Application.nativeBuildVersion ?? '0'}`;
}
