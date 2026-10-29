import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hypeStation } from '../api/hype';

// The station you last loved: a 🔥 or ❤️ while it played (Radio's reaction
// bar, or the car's fire and heart). Kept on this phone and shown on
// Profile, one tap from playing again. A 🔥 is also Hype (src/api/hype.js),
// which the database counts once per station a day.

const KEY = 'boa.radio.lastLiked';

let current;
const listeners = new Set();

/** { station, emoji, at } or null. */
export async function lastLiked() {
  if (current !== undefined) return current;
  try {
    current = JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null');
  } catch {
    current = null;
  }
  return current;
}

/** A 🔥 or ❤️ on a playing station. `reaction` is 'fire' or 'heart'. */
export function likeStation(station, reaction, { hype = true, now = Date.now() } = {}) {
  if (!station?.id || !station.streamUrl) return null;
  const emoji = reaction === 'fire' ? '🔥' : '❤️';
  current = { station, emoji, at: new Date(now).toISOString() };
  AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => {});
  listeners.forEach((fn) => fn(current));
  if (reaction === 'fire' && hype) hypeStation(station.id).catch?.(() => {});
  return current;
}

/** The last loved station, live. */
export function useLastLiked() {
  const [value, setValue] = useState(current ?? null);
  useEffect(() => {
    let alive = true;
    listeners.add(setValue);
    lastLiked().then((v) => alive && setValue(v));
    return () => {
      alive = false;
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

/** For tests. */
export function __reset() {
  current = undefined;
}
