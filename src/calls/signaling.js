import { supabase } from '../lib/supabase';

// Ringing for BOA video calls, over Supabase Realtime broadcast: each
// signed-in phone listens on its own inbox topic (boa-call:<user id>); a
// call sends 'ring' to the other person's inbox, and answers come back to
// the caller's. Only call control travels here (ring, accept, decline, end,
// busy). Audio and video will go over a media service (Agora/WebRTC) once
// it's wired in; until then a connected call is the call screen without
// pictures.

export const EVENTS = ['ring', 'accept', 'decline', 'end', 'busy'];
const topic = (userId) => `boa-call:${userId}`;

/** Listens for call signals sent to you. Returns a stop function. */
export function listen(myId, onSignal) {
  if (!supabase || !myId) return () => {};
  const channel = supabase.channel(topic(myId), { config: { broadcast: { self: false } } });
  EVENTS.forEach((event) => channel.on('broadcast', { event }, ({ payload }) => onSignal(event, payload ?? {})));
  channel.subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Sends a signal to someone's inbox, over Realtime's REST broadcast (no
 * need to join their topic). Resolves to whether it was accepted; a call
 * that can't ring just ends on the caller's side.
 */
export async function send(toId, event, payload) {
  if (!supabase || !toId) return false;
  const name = topic(toId);
  const existed = supabase.getChannels().some((c) => c.topic === `realtime:${name}`);
  const channel = supabase.channel(name);
  try {
    const res = await channel.httpSend(event, payload ?? {}, { timeout: 8000 });
    return !!res?.success;
  } catch (err) {
    console.warn('[call] signal not sent', err?.message ?? err);
    return false;
  } finally {
    if (!existed) supabase.removeChannel(channel);
  }
}
