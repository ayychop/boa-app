import { supabase } from '../lib/supabase';

// public.scheduled_calls (RLS: the host and the participant read and write
// their own rows; a room link can read the one row it names):
//   id, host_id, participant_id, room_id, scheduled_time, status, created_at
// status: 'pending' until the host starts the call, then 'active'.
// Realtime replication is on for the table, so a change to a row reaches
// everyone who can read it.

const TABLE = 'scheduled_calls';

const need = () => {
  if (!supabase) throw new Error('BOA HUB is not set up on this build.');
  return supabase;
};

/** Schedules a call with someone: a pending row, the room id being the call's id. */
export async function scheduleCall({ hostId, participantId, roomId, when }) {
  if (!hostId || !participantId || !roomId) throw new Error('Pick someone to call first.');
  const res = await need()
    .from(TABLE)
    .insert({ host_id: hostId, participant_id: participantId, room_id: roomId, scheduled_time: new Date(when).toISOString(), status: 'pending' })
    .select('*')
    .single();
  if (res.error) throw new Error(res.error.message || "Couldn't schedule that call.");
  return res.data;
}

/** The scheduled call for a room, or null if there's none (or it isn't visible to you). */
export async function fetchRoom(roomId) {
  const res = await need().from(TABLE).select('*').eq('room_id', roomId).maybeSingle();
  if (res.error) throw new Error(res.error.message || "Couldn't load that call.");
  return res.data ?? null;
}

/**
 * The host starts the call: the row turns 'active', and everyone waiting on
 * the countdown is taken into the room. Only a pending row can be started.
 */
export async function startRoom(roomId) {
  const res = await need().from(TABLE).update({ status: 'active' }).eq('room_id', roomId).eq('status', 'pending').select('*').maybeSingle();
  if (res.error) throw new Error(res.error.message || "Couldn't start that call.");
  return res.data ?? null;
}

/** The host cancels a call that hasn't started. */
export async function cancelRoom(roomId) {
  const res = await need().from(TABLE).update({ status: 'cancelled' }).eq('room_id', roomId).eq('status', 'pending').select('*').maybeSingle();
  if (res.error) throw new Error(res.error.message || "Couldn't cancel that call.");
  return res.data ?? null;
}

/** Your calls still to come (host or participant), soonest first. */
export async function listUpcoming(userId, { now = Date.now() } = {}) {
  const since = new Date(now - 60 * 60 * 1000).toISOString();
  const res = await need()
    .from(TABLE)
    .select('*')
    .or(`host_id.eq.${userId},participant_id.eq.${userId}`)
    .eq('status', 'pending')
    .gte('scheduled_time', since)
    .order('scheduled_time', { ascending: true })
    .limit(50);
  if (res.error) throw new Error(res.error.message || "Couldn't load your scheduled calls.");
  return res.data ?? [];
}

let channels = 0;

/**
 * Listens to one room's row. `onRow(row)` gets every change (the new row;
 * null if it's deleted); `onStatus(status)` gets the channel's own state
 * ('SUBSCRIBED', 'CHANNEL_ERROR', ...), so the caller can reload what it
 * missed while it wasn't connected. Returns the function that stops it.
 */
export function subscribeRoom(roomId, onRow, onStatus) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`boa-room:${roomId}:${++channels}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: `room_id=eq.${roomId}` }, (payload) => {
      onRow(payload.eventType === 'DELETE' ? null : payload.new);
    })
    .subscribe((status) => onStatus?.(status));
  return () => {
    supabase.removeChannel(channel);
  };
}

/** Listens to every change to your own scheduled calls, as host or as participant. */
export function subscribeMine(userId, onChange) {
  if (!supabase || !userId) return () => {};
  const channel = supabase
    .channel(`boa-schedule:${userId}:${++channels}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: `host_id=eq.${userId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: `participant_id=eq.${userId}` }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
