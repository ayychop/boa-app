import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

// The welcome tour (components/onboarding/FeatureTour.js) shows once:
// profiles.has_seen_onboarding for members, with a copy on the phone so it
// never shows twice here even offline, or before the database has the
// column (supabase/migrations/20261026230000). Listeners who haven't
// signed in to the Hub get it once per phone.
const localKey = (userId) => `boa.tour.seen.${userId}`;
export const DEVICE_KEY = 'boa.tour.seen';

// Postgres "undefined column": the migration hasn't been run yet.
const MISSING_COLUMN = '42703';

const REPLAY_EVENT = 'boa.tour.replay';

async function seenHere(userId) {
  try {
    const [device, member] = await Promise.all([
      AsyncStorage.getItem(DEVICE_KEY),
      userId ? AsyncStorage.getItem(localKey(userId)) : null,
    ]);
    return device === '1' || member === '1';
  } catch {
    return false;
  }
}

/**
 * Whether the tour has been seen: true, false, or null when it can't be
 * told right now (offline), in which case it waits for next time. Without
 * a userId only this phone is asked.
 */
export async function hasSeenTour(userId) {
  if (await seenHere(userId)) return true;
  if (!userId || !supabase) return false;
  try {
    const { data, error } = await supabase.from('profiles').select('has_seen_onboarding').eq('id', userId).maybeSingle();
    if (error) return error.code === MISSING_COLUMN ? false : null;
    if (data?.has_seen_onboarding) {
      AsyncStorage.setItem(localKey(userId), '1').catch(() => {});
      return true;
    }
    return data ? false : null;
  } catch {
    return null;
  }
}

/** Marks the tour seen, on the phone and on the member's profile. */
export async function markTourSeen(userId) {
  await AsyncStorage.setItem(DEVICE_KEY, '1').catch(() => {});
  if (!userId) return;
  await AsyncStorage.setItem(localKey(userId), '1').catch(() => {});
  if (!supabase) return;
  try {
    await supabase.from('profiles').update({ has_seen_onboarding: true }).eq('id', userId);
  } catch {}
}

/** Shows the tour again (Profile's "Replay Welcome Tour"). */
export function replayTour() {
  DeviceEventEmitter.emit(REPLAY_EVENT);
}

/** Calls onReplay whenever replayTour runs; returns the unsubscribe. */
export function onTourReplay(onReplay) {
  const sub = DeviceEventEmitter.addListener(REPLAY_EVENT, onReplay);
  return () => sub.remove();
}
