import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as BoaCall from '../../modules/boa-call';
import { callChannel } from '../chat/notifications';
import { ringtoneHaptics } from './ringtone';

// An incoming call while the app isn't on screen. On Android the ring
// arrives as a data-only push (supabase/functions/call-push), which wakes
// the app's JS even when it was closed (src/calls/pushTask.js); the native
// module (modules/boa-call) then rings it like a phone call: a full-screen,
// call-style notification with Answer and Decline that wakes the phone.
// Answering or tapping opens the app on a call link,
//
//   network.boa://call/<call id>?from=<id>&name=<name>&avatar=<url>&at=<sent at>[&action=accept]
//
// which CallContext turns back into the call. Without the native module
// (iOS, older builds) it's an ordinary notification on the ringtone's
// channel, and tapping it opens the call screen.

// How long a call rings before it's a missed call.
export const RING_MS = 30000;

/** The link that opens a call; action 'accept' answers it too. */
export function callLink({ callId, from, sentAt }, action) {
  const q = new URLSearchParams({ from: from.id, name: from.name ?? '', at: String(sentAt ?? Date.now()) });
  if (from.avatar_url) q.set('avatar', from.avatar_url);
  if (action) q.set('action', action);
  return `network.boa://call/${encodeURIComponent(callId)}?${q.toString()}`;
}

/** A call link read back: { callId, from, sentAt, action }, or null for any other link. */
export function parseCallLink(url) {
  const m = /^network\.boa:\/\/+call\/([^/?#]+)\??([^#]*)/i.exec(url || '');
  if (!m) return null;
  const q = new URLSearchParams(m[2]);
  const id = q.get('from');
  if (!id) return null;
  return {
    callId: decodeURIComponent(m[1]),
    from: { id, name: q.get('name') || 'BOA HUB member', avatar_url: q.get('avatar') || null },
    sentAt: Number(q.get('at')) || Date.now(),
    action: q.get('action') || null,
  };
}

const parse = (v) => {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

/**
 * The call in a push's data, however it arrived (a background task's
 * dataString, Expo's JSON body, or a notification's data), or null if it
 * isn't a call: { callId, from, sentAt, ringtone }.
 */
export function callFromPush(data) {
  let d = data ?? {};
  // The background task gets FCM's whole message, the call one level down in data.
  if (d.type !== 'call' && d.data && typeof d.data === 'object') d = d.data;
  if (d.dataString) d = parse(d.dataString) ?? {};
  if (d.type !== 'call' && d.body) d = parse(d.body) ?? d;
  if (d.type !== 'call' || !d.callId) return null;
  const from = parse(d.from);
  if (!from?.id) return null;
  return { callId: String(d.callId), from, sentAt: Number(d.sentAt) || Date.now(), ringtone: d.ringtone ?? null };
}

/** How long a call sent at sentAt has left to ring. */
export const ringLeft = (sentAt) => RING_MS - Math.max(0, Date.now() - (Number(sentAt) || Date.now()));

// Calls rung by notification, by id: who's calling, so Decline on the
// notification can tell them even if the call screen never heard of it.
const pending = new Map();
export const pendingCall = (callId) => pending.get(callId) ?? null;

/** Rings a call by notification (the app isn't on screen). Resolves to whether it went up. */
export async function ringNotification({ callId, from, sentAt, ringtone }) {
  const left = ringLeft(sentAt);
  if (left < 2000) return false;
  pending.set(callId, { callId, from, sentAt });
  const call = { callId, from, sentAt };
  if (BoaCall.isAvailable) {
    return BoaCall.showIncoming({
      callId,
      name: from.name,
      avatar: from.avatar_url ?? '',
      link: callLink(call),
      acceptLink: callLink(call, 'accept'),
      channelId: callChannel(ringtone),
      // The buzz on the ringtone's bass hits, as in the app.
      vibration: ringtoneHaptics(ringtone),
      // A moment past the ring, so the app ends it as missed first.
      timeoutMs: left + 1500,
    });
  }
  const id = await Notifications.scheduleNotificationAsync({
    identifier: `call-${callId}`,
    content: {
      title: from.name,
      body: 'Incoming video call',
      sound: `${callChannel(ringtone).slice('boa-call-'.length)}.wav`,
      priority: Notifications.AndroidNotificationPriority?.MAX,
      data: { type: 'call', callId, from, sentAt },
    },
    trigger: Platform.OS === 'android' ? { channelId: callChannel(ringtone) } : null,
  }).catch(() => null);
  return !!id;
}

/** Stops ringing by notification: answered, declined, over, or the app came to the front. */
export function stopRingNotification(callId) {
  if (callId) pending.delete(callId);
  BoaCall.cancelIncoming();
  if (callId && !BoaCall.isAvailable) Notifications.dismissNotificationAsync?.(`call-${callId}`)?.catch?.(() => {});
}
