import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

// The welcome tour (components/onboarding/FeatureTour.js) shows once per
// member: profiles.has_seen_onboarding, with a copy on the phone so it
// never shows twice here even offline, or before the database has the
// column (supabase/migrations/20261026230000).
const localKey = (userId) => `boa.tour.seen.${userId}`;

// Postgres "undefined column": the migration hasn't been run yet.
const MISSING_COLUMN = '42703';

/**
 * Whether this member has seen the tour: true, false, or null when it
 * can't be told right now (offline), in which case it waits for next time.
 */
export async function hasSeenTour(userId) {
  if (!userId) return null;
  try {
    if ((await AsyncStorage.getItem(localKey(userId))) === '1') return true;
  } catch {}
  if (!supabase) return false;
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
  if (!userId) return;
  await AsyncStorage.setItem(localKey(userId), '1').catch(() => {});
  if (!supabase) return;
  try {
    await supabase.from('profiles').update({ has_seen_onboarding: true }).eq('id', userId);
  } catch {}
}
