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
      icon: 'call',
      title: 'Calls ring straight away',
      body: "A call now wakes the other phone even when BOA is closed or asleep in a pocket. Tap the call notification to answer, and a missed call stays in your notifications.",
    },
    {
      icon: 'color-palette',
      title: 'Chat vibes, brighter',
      body: 'Every vibe now has its own colours, from Neon blue and violet to Golden Hour amber and The Block concrete. Picking one changes the whole thread, bubbles included.',
    },
    {
      icon: 'videocam',
      title: 'A cleaner call screen',
      body: 'Your Studio filter levels now sit above the controls, and the dock is solid glass, so nothing shows through the buttons.',
    },
    {
      icon: 'notifications',
      title: 'Notifications that stay',
      body: "Messages and hearts pop up and stay in your notification shade, even when the app is open.",
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
