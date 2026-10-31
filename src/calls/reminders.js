import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { ensurePermission } from '../chat/notifications';
import { clock, phaseOf, reminderAt, roomLink, timeOf } from './schedule';

// Local reminders for calls: a notification on this phone ten minutes before
// (src/calls/schedule.js REMINDER_LEAD_MS), no server involved, so it fires
// with the app closed. Tapping it opens the countdown (or the chat, for a
// plain reminder): see ScheduledCallSync.
//
// What's scheduled is remembered (key -> notification id and time), so
// setting the same reminder twice replaces it, cancelling finds it, and
// syncing the database's list doesn't schedule what's already set.

const STORE = 'boa.callReminders.v1';
export const REMINDER_CHANNEL = 'boa-reminders';
/** Reminders not tied to a scheduled call carry this prefix in their key. */
export const PLAIN_PREFIX = 'reminder:';

async function load() {
  try {
    return JSON.parse((await AsyncStorage.getItem(STORE)) ?? '{}') || {};
  } catch {
    return {};
  }
}

const save = (map) => AsyncStorage.setItem(STORE, JSON.stringify(map)).catch(() => {});

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
    name: 'Call reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 120, 250],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  }).catch(() => null);
}

/** Every reminder still set: { key: { id, at, when } }. */
export const savedReminders = load;

/** Cancels the reminder under `key`, if there is one. */
export async function cancelReminder(key) {
  const map = await load();
  const mine = map[key];
  if (!mine) return false;
  await Notifications.cancelScheduledNotificationAsync(mine.id).catch(() => {});
  delete map[key];
  await save(map);
  return true;
}

/**
 * Sets a reminder for something at `when` (ms), ten minutes before.
 * `key` is the room id for a scheduled call, or `reminder:<id>`.
 * `prompt: false` never asks for permission (a background sync mustn't pop a
 * dialog); it just doesn't schedule if notifications are off.
 * Resolves to { at, id } or one of the reasons it didn't happen:
 *   { reason: 'too-soon' }   the time is under a minute away or past
 *   { reason: 'denied' }     notifications are off for BOA
 *   { reason: 'failed' }     the phone refused
 */
export async function setReminder({ key, when, title, body, data = {}, now = Date.now(), prompt = true }) {
  const at = reminderAt(when, now);
  if (at == null) return { reason: 'too-soon' };
  const allowed = prompt ? await ensurePermission() : !!(await Notifications.getPermissionsAsync().catch(() => null))?.granted;
  if (!allowed) return { reason: 'denied' };
  const map = await load();
  // Already set for this very time: nothing to redo.
  if (map[key] && map[key].when === when && map[key].at === at) return { at, id: map[key].id, kept: true };
  if (map[key]) await Notifications.cancelScheduledNotificationAsync(map[key].id).catch(() => {});
  try {
    await ensureChannel();
    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: 'default', data: { type: 'call-reminder', ...data } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: REMINDER_CHANNEL },
    });
    map[key] = { id, at, when };
    await save(map);
    return { at, id };
  } catch (err) {
    console.log('[reminders] schedule failed', err?.message ?? err);
    return { reason: 'failed' };
  }
}

/** The reminder text for a call with `name` at `when`. */
export const reminderText = (name, when) => ({
  title: name ? `Call with ${name} in 10 minutes` : 'Your BOA call is in 10 minutes',
  body: `Scheduled for ${clock(when)}. Tap to open the countdown.`,
});

/** The reminder for a scheduled call row; `name` is the other person's. */
export function remindForRow(row, name, { now, prompt } = {}) {
  const when = timeOf(row);
  const text = reminderText(name, when);
  return setReminder({ key: row.room_id, when, ...text, data: { roomId: row.room_id, link: roomLink(row.room_id) }, now, prompt });
}

/** A plain "remind me to call" in a chat. */
export function remindToCall({ key, when, name, conversationId, now }) {
  return setReminder({
    key,
    when,
    title: name ? `Call ${name} in 10 minutes` : 'Time to make your call',
    body: `You asked to be reminded at ${clock(when)}. Tap to open the chat.`,
    data: { conversationId },
    now,
  });
}

/**
 * Brings the phone's reminders in line with the database's list of your
 * pending calls: each future one has its reminder, and a reminder for a
 * call that was started, cancelled or removed is dropped. Plain reminders
 * (no call behind them) are left alone. `nameOf(row)` may be async.
 */
export async function syncCallReminders(rows, { nameOf, now = Date.now() } = {}) {
  const live = new Set();
  for (const row of rows ?? []) {
    if (phaseOf(row) !== 'pending' || !(timeOf(row) > now)) continue;
    live.add(row.room_id);
    const name = nameOf ? await Promise.resolve(nameOf(row)).catch(() => null) : null;
    await remindForRow(row, name, { now, prompt: false });
  }
  const map = await load();
  for (const key of Object.keys(map)) {
    if (key.startsWith(PLAIN_PREFIX) || live.has(key)) continue;
    await cancelReminder(key);
  }
  return live.size;
}

/** Reminders whose time has passed are just history: forget them. */
export async function pruneReminders(now = Date.now()) {
  const map = await load();
  let changed = false;
  for (const [key, r] of Object.entries(map)) {
    if (r.when < now - 60 * 60 * 1000) {
      delete map[key];
      changed = true;
    }
  }
  if (changed) await save(map);
}
