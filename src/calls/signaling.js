import { supabase } from '../lib/supabase';
import { DEVICE_ID } from './device';

// Ringing for BOA video calls, over Supabase Realtime broadcast: each
// signed-in phone listens on its own inbox topic (boa-call:<user id>); a
// call sends 'ring' to the other person's inbox, and answers come back to
// the caller's.
//
// The inboxes are PRIVATE channels. Row level security on realtime.messages
// (supabase/migrations/20261027120000_private_call_ringing.sql) lets only
// you listen to your own inbox, and only signed-in, unbanned members who
// you haven't blocked (and who haven't blocked you) send to it. Nobody else
// can see who is calling whom or learn a call's id, which is also its
// Agora channel. Only call control travels here (ring, accept, decline, end,
// busy, waiting). Audio and video go over Agora (src/calls/media), on a
// channel named by the call's id.
//
// Signed in on two phones, both listen on the same inbox, so every signal
// carries the phone it came from (device), and an answer says which phone it
// is for (toDevice). A phone ignores signals from itself and signals meant
// for its other phone.
//
//   ring      someone is calling (every phone of yours rings)
//   accept    answered (it may carry join: a call to merge into)
//   decline   turned away
//   end       hung up, or the ring ran out
//   busy      on another call and not taking a second
//   waiting   "I'm on a call; yours rings as a call waiting"
//   answered  to yourself: this ring was dealt with on your other phone
//   transfer  to yourself: the other phone asks for your live call
//   released  to yourself: this phone let go of the call, take it
//   moved     to the call's other person: the call is now on another phone
//   party     to a call's people: someone was merged into it
//   nudge     to yourself: look again at which phone has your call

export const EVENTS = ['ring', 'accept', 'decline', 'end', 'busy', 'waiting', 'answered', 'transfer', 'released', 'moved', 'party', 'nudge'];
const topic = (userId) => `boa-call:${userId}`;
const PRIVATE = { private: true };

// Private channels are checked against the signed-in session, so Realtime
// needs the current access token before joining or sending.
const authed = () => supabase.realtime.setAuth().catch(() => {});

/** Listens for call signals sent to you. Returns a stop function. */
export function listen(myId, onSignal) {
  if (!supabase || !myId) return () => {};
  const channel = supabase.channel(topic(myId), { config: { ...PRIVATE, broadcast: { self: false } } });
  EVENTS.forEach((event) =>
    channel.on('broadcast', { event }, ({ payload }) => {
      const p = payload ?? {};
      // Your own phone's echo, and what was meant for your other phone.
      if (p.device && p.device === DEVICE_ID) return;
      if (p.toDevice && p.toDevice !== DEVICE_ID) return;
      onSignal(event, p);
    }),
  );
  let stopped = false;
  authed().then(() => {
    if (stopped) return;
    channel.subscribe((status, err) => {
      console.log('[call] inbox', status, err?.message ?? '');
      if (status === 'CHANNEL_ERROR') console.error('[call] inbox refused', err?.message ?? err);
    });
  });
  return () => {
    stopped = true;
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
  const channel = supabase.channel(name, { config: PRIVATE });
  try {
    await authed();
    const res = await channel.httpSend(event, { ...(payload ?? {}), device: DEVICE_ID }, { timeout: 8000 });
    console.log('[call] signal sent', event, res);
    return !!res?.success;
  } catch (err) {
    console.error('[call] signal not sent', event, err?.message ?? err);
    return false;
  } finally {
    if (!existed) supabase.removeChannel(channel);
  }
}

/**
 * Rings their phone by push as well (supabase/functions/call-push): Android
 * freezes a backgrounded app's Realtime socket, so the push is what wakes a
 * phone in a pocket. Resolves to whether at least one phone was sent it.
 */
export async function pushRing(toId, callId) {
  if (!supabase || !toId || !callId) return false;
  try {
    const { data, error } = await supabase.functions.invoke('call-push', { body: { to: toId, callId } });
    if (error) throw error;
    console.log('[call] push sent', data);
    return (data?.sent ?? 0) > 0;
  } catch (err) {
    console.warn('[call] push not sent', err?.message ?? err);
    return false;
  }
}

/**
 * Stops a ring on the phones that are asleep (supabase/functions/call-push,
 * action cancel): the caller hung up before an answer, or you answered on
 * one phone and the other, with the app closed, is still ringing by
 * notification. Resolves to whether it was sent. Never throws.
 */
export async function pushCancel(toId, callId) {
  if (!supabase || !toId || !callId) return false;
  try {
    const { data, error } = await supabase.functions.invoke('call-push', { body: { to: toId, callId, action: 'cancel' } });
    if (error) throw error;
    return (data?.sent ?? 0) > 0;
  } catch (err) {
    console.warn('[call] cancel push not sent', err?.message ?? err);
    return false;
  }
}
