import AsyncStorage from '@react-native-async-storage/async-storage';
import { check, need } from './posts';

// Hearts (supabase/migrations: hearts). A heart on a post tells its owner
// (a notification, never a count); hearts on stations and Originals are
// your favourites, on your profile. Nothing records what the owner does
// with a heart, so the giver never learns whether it was seen.

const LAST_SEEN_KEY = 'boa.hub.heartsSeenAt';

/** Whether you've hearted these (kind, id) things: a Set of ids. */
export async function myHearts(userId, kind, ids) {
  if (!ids.length) return new Set();
  const { data, error } = await need().from('hearts').select('target_id').eq('liker_id', userId).eq('target_kind', kind).in('target_id', ids.map(String));
  return error ? new Set() : new Set((data ?? []).map((r) => r.target_id));
}

export async function heart(userId, kind, targetId, { label = '', meta = {} } = {}) {
  const { error } = await need()
    .from('hearts')
    .upsert({ liker_id: userId, target_kind: kind, target_id: String(targetId), target_label: String(label).slice(0, 120), target_meta: meta }, { onConflict: 'liker_id,target_kind,target_id', ignoreDuplicates: true });
  if (error) check({ error });
}

export async function unheart(userId, kind, targetId) {
  check(await need().from('hearts').delete().eq('liker_id', userId).eq('target_kind', kind).eq('target_id', String(targetId)));
}

/** Someone's favourite stations and Originals, newest first. Empty if the database is behind. */
export async function listFavourites(userId, limit = 24) {
  const { data, error } = await need()
    .from('hearts')
    .select('target_kind, target_id, target_label, target_meta, created_at')
    .eq('liker_id', userId)
    .neq('target_kind', 'post')
    .order('created_at', { ascending: false })
    .limit(limit);
  return error ? [] : data ?? [];
}

/** Hearts on your posts, newest first (the database only shows you your own). */
export async function listHeartsOnMine(userId, limit = 60) {
  return check(await need().from('hearts').select('liker_id, target_id, created_at').eq('owner_id', userId).order('created_at', { ascending: false }).limit(limit)) ?? [];
}

// When you last opened your hearts, kept on this phone only: the giver
// can never see it.
export async function heartsSeenAt() {
  try {
    return (await AsyncStorage.getItem(LAST_SEEN_KEY)) ?? null;
  } catch {
    return null;
  }
}
export async function markHeartsSeen(at = new Date().toISOString()) {
  try {
    await AsyncStorage.setItem(LAST_SEEN_KEY, at);
  } catch {}
}

/** What a saved station needs to be played from someone else's profile. */
export const stationMeta = (s) => ({ kind: 'radio', id: s.id, name: s.name, streamUrl: s.streamUrl, logo: s.logo ?? null, country: s.country ?? null, tags: (s.tags ?? []).slice(0, 5) });
