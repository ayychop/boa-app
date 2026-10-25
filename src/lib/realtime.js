import { supabase } from './supabase';

let count = 0;

/**
 * A Realtime channel of its own for one subscriber. supabase.channel(name)
 * hands back the existing channel when the name is already taken, and
 * adding listeners to one that has subscribed throws, which crashed the
 * app when the chat list and a thread both watched the same person. The
 * name only labels the socket topic (postgres_changes filters do the
 * real work), so each caller gets a unique one, and removing it never
 * tears down someone else's. Not for presence: that topic is the room.
 */
export function ownChannel(name) {
  count += 1;
  return supabase.channel(`${name}:${count}`);
}
