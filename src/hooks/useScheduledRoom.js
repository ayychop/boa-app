import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { fetchRoom, subscribeRoom } from '../api/scheduledCalls';
import { getProfile } from '../api/hub';
import { phaseOf, timeOf } from '../calls/schedule';

// How often to look again while the time has passed and the host hasn't
// started: Realtime is the main path, this is the net under it for a dropped
// connection or a phone that was asleep when the row changed.
const POLL_MS = 4000;
const POLL_FAR_MS = 30000;

/**
 * A scheduled room, live.
 *
 * Loads the row for `roomId`, listens to it over Realtime (postgres_changes
 * on scheduled_calls, filtered on the room), and reloads whenever the
 * channel (re)connects, the app comes back to the foreground, or, as a
 * safety net, on a timer. So "pending" turning "active" reaches the
 * countdown screen at once, and one that was missed while the phone slept
 * is still caught.
 *
 * Returns { state, row, host, guest, error, reload } where state is
 * 'loading', 'missing' (no such room, or it isn't yours to see), 'pending',
 * 'active', 'over' or 'error'. `host` and `guest` are the two profiles.
 */
export default function useScheduledRoom(roomId, { enabled = true } = {}) {
  const [row, setRow] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [people, setPeople] = useState({});
  const alive = useRef(true);
  const asked = useRef(new Set());

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!roomId) return;
    try {
      const next = await fetchRoom(roomId);
      if (!alive.current) return;
      setRow(next);
      setError(null);
      setLoaded(true);
    } catch (err) {
      if (!alive.current) return;
      setError(err.message);
      setLoaded(true);
    }
  }, [roomId]);

  useEffect(() => {
    if (!enabled || !roomId) return undefined;
    setRow(null);
    setLoaded(false);
    setError(null);
    reload();
    const off = subscribeRoom(
      roomId,
      (next) => {
        if (!alive.current) return;
        setRow(next);
        setError(null);
        setLoaded(true);
      },
      (status) => {
        // Whatever changed while the channel wasn't up is picked up now.
        if (status === 'SUBSCRIBED') reload();
      },
    );
    const app = AppState.addEventListener('change', (s) => s === 'active' && reload());
    return () => {
      off();
      app?.remove?.();
    };
  }, [enabled, roomId, reload]);

  // The safety-net poll: quick once the time is here, slow before it.
  const status = phaseOf(row);
  const when = timeOf(row);
  useEffect(() => {
    if (!enabled || !roomId || status !== 'pending') return undefined;
    const tick = () => reload();
    const id = setInterval(tick, Number.isFinite(when) && Date.now() >= when - 60000 ? POLL_MS : POLL_FAR_MS);
    return () => clearInterval(id);
  }, [enabled, roomId, status, when, reload]);

  // Who's on the call, for the faces and names.
  const hostId = row?.host_id;
  const guestId = row?.participant_id;
  useEffect(() => {
    for (const id of [hostId, guestId]) {
      if (!id || asked.current.has(id)) continue;
      asked.current.add(id);
      getProfile(id)
        .then((p) => alive.current && p && setPeople((m) => ({ ...m, [id]: p })))
        .catch(() => asked.current.delete(id));
    }
  }, [hostId, guestId]);

  let state;
  if (!loaded) state = 'loading';
  else if (error && !row) state = 'error';
  else state = phaseOf(row);

  return { state, row, host: hostId ? people[hostId] ?? null : null, guest: guestId ? people[guestId] ?? null : null, error, reload };
}
