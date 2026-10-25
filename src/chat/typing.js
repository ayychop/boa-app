import { supabase } from '../lib/supabase';

// While you type, a "typing" ping goes out at most this often...
export const TYPING_EVERY_MS = 2500;
// ...and the other side shows the dots for this long after the last one.
export const TYPING_HOLD_MS = 4500;

const NOOP = { ping() {}, stop() {}, close() {} };

/**
 * "Typing" between the two people in a conversation, over a Realtime
 * broadcast room named after it (nothing is stored). onTyping(true/false)
 * fires when the other person starts or stops. Returns { ping, stop, close }.
 * If the room is already open on this phone (the same thread twice), it
 * quietly does nothing rather than share it.
 */
export function openTyping(conversationId, userId, onTyping) {
  if (!supabase || !conversationId || !userId) return NOOP;
  let channel = null;
  let ready = false;
  try {
    channel = supabase.channel(`hub:typing:${conversationId}`, { config: { broadcast: { self: false } } });
    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.userId && payload.userId !== userId) onTyping(!!payload.typing);
      })
      .subscribe((status) => {
        ready = status === 'SUBSCRIBED';
      });
  } catch {
    return NOOP;
  }
  const send = (typing) => {
    if (!ready) return;
    Promise.resolve(channel.send({ type: 'broadcast', event: 'typing', payload: { userId, typing } })).catch(() => {});
  };
  return {
    ping: () => send(true),
    stop: () => send(false),
    close: () => {
      ready = false;
      supabase.removeChannel(channel);
    },
  };
}
