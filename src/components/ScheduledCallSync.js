import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useHub } from '../context/HubContext';
import { getProfile } from '../api/hub';
import { listUpcoming, subscribeMine } from '../api/scheduledCalls';
import { pruneReminders, syncCallReminders } from '../calls/reminders';
import { openScheduledCall } from '../calls/openRoom';
import { openPage } from '../navigation/ref';

// Keeps the phone's reminders for your scheduled calls right, with nothing on
// screen: when you sign in, when the app comes back, and whenever a call of
// yours changes (Realtime), the pending ones get their reminder ten minutes
// before and the cancelled or started ones lose it. Also opens the countdown
// when a reminder is tapped. Renders nothing.

const SETTLE_MS = 600;
const handled = new Set();

/** A tapped reminder: the countdown, or the chat it was set in. */
export function openFromReminder(response) {
  const n = response?.notification;
  const data = n?.request?.content?.data ?? {};
  if (data.type !== 'call-reminder') return false;
  // The same tap can arrive twice (the listener and the cold-start read).
  const key = `${n?.request?.identifier}:${n?.date ?? ''}`;
  if (handled.has(key)) return false;
  handled.add(key);
  if (data.roomId) return openScheduledCall(data.roomId) || true;
  if (data.conversationId) return openPage('HubThread', { id: data.conversationId }) || true;
  return false;
}

export default function ScheduledCallSync() {
  const { userId, stage } = useHub();

  // A reminder tapped: the app was closed, or it's open.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(openFromReminder);
    Promise.resolve(Notifications.getLastNotificationResponseAsync?.())
      .then((r) => r && openFromReminder(r))
      .catch(() => {});
    return () => sub?.remove?.();
  }, []);

  useEffect(() => {
    if (stage !== 'ready' || !userId) return undefined;
    let alive = true;
    let timer = null;
    const names = new Map();
    const nameOf = async (row) => {
      const id = row.host_id === userId ? row.participant_id : row.host_id;
      if (!names.has(id)) {
        const p = await getProfile(id).catch(() => null);
        names.set(id, p?.display_name || (p?.username ? `@${p.username}` : null));
      }
      return names.get(id);
    };
    const run = async () => {
      try {
        const rows = await listUpcoming(userId);
        if (!alive) return;
        await syncCallReminders(rows, { nameOf });
        await pruneReminders();
      } catch (err) {
        console.log('[schedule] sync failed', err?.message ?? err);
      }
    };
    // A burst of changes (a call started, its row updated twice) is one sync.
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(run, SETTLE_MS);
    };
    later();
    const off = subscribeMine(userId, later);
    const app = AppState.addEventListener('change', (s) => s === 'active' && later());
    return () => {
      alive = false;
      clearTimeout(timer);
      off();
      app?.remove?.();
    };
  }, [userId, stage]);

  return null;
}
