import { useEffect, useState } from 'react';

// Whether the floating play bar (src/components/MiniPlayer.js) has been
// swiped away. Hiding it never touches the audio: it is only the bar that
// goes, and a small floating music icon takes its place to bring it back.
//
// The bar comes back by itself when what's playing changes (a new station, a
// different Zen sound) or when nothing is playing any more, so a hidden bar
// never leaves a later song without one.

let dismissed = false;
let lastKey = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export const isMiniDismissed = () => dismissed;

/** Swiped away. */
export function dismissMini() {
  if (dismissed) return;
  dismissed = true;
  emit();
}

/** Brought back (the music icon, or something new started playing). */
export function restoreMini() {
  if (!dismissed) return;
  dismissed = false;
  emit();
}

/**
 * Tells the store what the bar is showing ('radio:<id>', 'zen:<id>' or null).
 * A different thing, or nothing, un-hides the bar.
 */
export function syncMiniKey(key) {
  if (key === lastKey) return;
  lastKey = key;
  restoreMini();
}

export const resetMini = () => {
  dismissed = false;
  lastKey = null;
};

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/**
 * Whether the bar is swiped away; re-renders when that changes.
 *
 * Deliberately useState + useEffect, not useSyncExternalStore: Home, Radio,
 * Talent and the other tabs freeze when you leave them (react-freeze holds
 * them in a Suspense boundary), and a store update aimed at a frozen
 * useSyncExternalStore consumer makes React retry that boundary forever
 * (the app hangs). A plain state update just waits for the tab to wake.
 */
export function useMiniDismissed() {
  const [value, setValue] = useState(isMiniDismissed);
  useEffect(() => {
    setValue(isMiniDismissed());
    return subscribe(() => setValue(isMiniDismissed()));
  }, []);
  return value;
}
