import { supabase } from '../lib/supabase';
import { DEVICE_ID } from './device';

// Which phone has your call (supabase/migrations/20261110120000_call_presence.sql).
// The phone on a call writes one row and refreshes it every few seconds; your
// other phone reads it when it comes to the front and offers to take the call
// over. Every failure is swallowed: calls never depend on this.

/** How often the phone with the call says so. */
export const BEAT_MS = 5000;
/** A row older than this is a call that is over. */
export const FRESH_MS = 30000;

/** Says "this phone has this call". Safe to repeat: it refreshes the row. */
export async function announce(userId, call) {
  if (!supabase || !userId || !call?.id || !call.peer?.id) return false;
  try {
    const { error } = await supabase.from('active_calls').upsert(
      {
        user_id: userId,
        device: DEVICE_ID,
        call_id: call.id,
        channel: call.channel ?? call.id,
        peer_id: call.peer.id,
        voice: !!call.voice,
        started_at: new Date(call.startedAt ?? Date.now()).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,device' },
    );
    return !error;
  } catch {
    return false;
  }
}

/** This phone no longer has a call. */
export async function retract(userId) {
  if (!supabase || !userId) return false;
  try {
    const { error } = await supabase.from('active_calls').delete().eq('user_id', userId).eq('device', DEVICE_ID);
    return !error;
  } catch {
    return false;
  }
}

/**
 * The call your OTHER phone has right now, with who is on it, or null:
 * { callId, channel, device, voice, startedAt, peer: { id, name, avatar_url } }.
 */
export async function otherPhoneCall(userId, now = Date.now()) {
  if (!supabase || !userId) return null;
  try {
    const { data, error } = await supabase
      .from('active_calls')
      .select('call_id, channel, device, voice, started_at, updated_at, peer_id')
      .eq('user_id', userId)
      .neq('device', DEVICE_ID)
      .gt('updated_at', new Date(now - FRESH_MS).toISOString())
      .order('updated_at', { ascending: false })
      .limit(1);
    const row = data?.[0];
    if (error || !row) return null;
    const { data: person } = await supabase.from('profiles').select('id, username, display_name, avatar_url').eq('id', row.peer_id).maybeSingle();
    return {
      callId: row.call_id,
      channel: row.channel,
      device: row.device,
      voice: !!row.voice,
      startedAt: new Date(row.started_at).getTime(),
      peer: {
        id: row.peer_id,
        name: person?.display_name || (person?.username ? `@${person.username}` : 'BOA HUB member'),
        avatar_url: person?.avatar_url ?? null,
      },
    };
  } catch {
    return null;
  }
}
