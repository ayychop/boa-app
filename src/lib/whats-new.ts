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
      title: 'Calls connect first time',
      body: "Your call is now set up while you chat, so the first one after you open BOA connects straight away. If one ever fails, the next starts completely fresh.",
    },
    {
      icon: 'sparkles',
      title: 'Real 1080p Studio filters',
      body: 'Brightness, Smooth Skin, Tone, Clarity and Saturation are now done by the camera itself in full HD, before your video is sent. Fine detail like tattoos stays sharp, and what you see is what they see.',
    },
    {
      icon: 'color-palette',
      title: 'Chat vibes, transformed',
      body: 'Each vibe now takes over the whole thread, bubbles and all. Midnight glows on deep blue, Minimalist goes bright white with stark black text, and Turntable spins a record behind your chat.',
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
