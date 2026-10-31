// Scheduled calls: the pure parts. Links, times, the countdown's numbers and
// the picker's choices. No React, no network, so every rule here is tested
// on its own (__tests__/scheduled-calls.test.js).
//
// A scheduled call is a row in public.scheduled_calls:
//   id, host_id, participant_id, room_id, scheduled_time, status, created_at
// `room_id` is the call's id: the Agora channel (supabase/functions/agora-token
// takes any UUID) and the id the host's ring carries, so the link, the ring and
// the room are all the same thing. `status` is 'pending' until the host starts
// the call, then 'active'. Anything else (cancelled, completed, ended ...) is
// treated as over.

export const REMINDER_LEAD_MS = 10 * 60 * 1000;
/** A call can't be scheduled sooner than this from now; a reminder for it wouldn't have time to fire. */
export const MIN_LEAD_MS = 60 * 1000;
export const LINK_SCHEME = 'boahub';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// A room id is a UUID; the token function accepts 16 to 64 of these characters.
const ROOM = /^[A-Za-z0-9-]{16,64}$/;

export const roomLink = (roomId) => `${LINK_SCHEME}://call/${roomId}`;

/**
 * The room a link opens, or null. `boahub://call/<room_id>` is the shared
 * link; `network.boa://call/<room_id>` works too. A network.boa link that
 * carries `from=` is a ring (src/calls/incoming.js), not a room link.
 */
export function parseRoomLink(url) {
  const m = /^(boahub|network\.boa):\/\/+call\/([^/?#]+)\/?(?:\?([^#]*))?(?:#.*)?$/i.exec(String(url ?? '').trim());
  if (!m) return null;
  let id;
  try {
    id = decodeURIComponent(m[2]);
  } catch {
    return null;
  }
  if (!ROOM.test(id)) return null;
  if (m[1].toLowerCase() !== LINK_SCHEME && /(?:^|&)from=/.test(m[3] ?? '')) return null;
  return id;
}

/** A room link inside a chat message ("Join me ... boahub://call/..."), or null. */
export function roomIdIn(text) {
  const m = /(?:boahub|network\.boa):\/\/call\/[A-Za-z0-9%-]+(?:\?[^\s]*)?/i.exec(String(text ?? ''));
  return m ? parseRoomLink(m[0]) : null;
}

/** A message with its room link taken out, for the card that replaces it. */
export const withoutRoomLink = (text) =>
  String(text ?? '')
    .replace(/(?:boahub|network\.boa):\/\/call\/[A-Za-z0-9%-]+(?:\?[^\s]*)?/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

// ---------------------------------------------------------------- the row

/**
 * Where a scheduled call stands, for the screen:
 *   'pending'  waiting for the host (before or after the time)
 *   'active'   the host started it: join now
 *   'over'     any other status
 * Null row: 'missing'.
 */
export function phaseOf(row) {
  if (!row) return 'missing';
  const status = String(row.status ?? '').toLowerCase();
  if (status === 'pending') return 'pending';
  if (status === 'active') return 'active';
  return 'over';
}

/** The row's time in ms, or NaN. */
export const timeOf = (row) => new Date(row?.scheduled_time ?? NaN).getTime();

// ---------------------------------------------------------------- countdown

const two = (n) => String(n).padStart(2, '0');

/**
 * The countdown as the screen draws it. Whole seconds, rounded up, so the
 * display reads 00:00:01 until the time is truly reached and never shows
 * zero early. `days` only appears when there are some.
 */
export function countdownParts(ms) {
  const left = Math.max(0, Math.ceil((Number.isFinite(ms) ? ms : 0) / 1000));
  const days = Math.floor(left / 86400);
  const hours = Math.floor((left % 86400) / 3600);
  const minutes = Math.floor((left % 3600) / 60);
  const seconds = left % 60;
  const units = [
    ...(days > 0 ? [{ id: 'days', label: 'Days', value: two(days) }] : []),
    { id: 'hours', label: 'Hours', value: two(hours) },
    { id: 'minutes', label: 'Minutes', value: two(minutes) },
    { id: 'seconds', label: 'Seconds', value: two(seconds) },
  ];
  return { done: left === 0, days, hours, minutes, seconds, units };
}

/** "in 2 hours 5 min", for screen readers and notification text. */
export function spokenCountdown(ms) {
  const { days, hours, minutes, seconds, done } = countdownParts(ms);
  if (done) return 'now';
  const bits = [];
  if (days) bits.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  if (hours) bits.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (minutes && !days) bits.push(`${minutes} min`);
  if (!days && !hours && !minutes) bits.push(`${seconds} sec`);
  return `in ${bits.join(' ')}`;
}

// ---------------------------------------------------------------- reminders

/**
 * When the reminder for a call at `when` should fire: ten minutes before.
 * A call closer than that still gets one, a few seconds from now; a call
 * that's already here (or under a minute away) gets none, because the
 * moment has gone.
 */
export function reminderAt(when, now = Date.now()) {
  if (!Number.isFinite(when) || when - now < MIN_LEAD_MS) return null;
  return Math.max(when - REMINDER_LEAD_MS, now + 5000);
}

// ---------------------------------------------------------------- picking a time

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const startOfDay = (when) => {
  const d = new Date(when);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const sameDay = (a, b) => startOfDay(a) === startOfDay(b);

/** "8:30 PM". */
export function clock(when) {
  const d = new Date(when);
  const h = d.getHours();
  return `${h % 12 || 12}:${two(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Today, 8:30 PM", "Tomorrow, 9:00 AM", "Mon 2 Nov, 8:30 PM". */
export function formatWhen(when, now = Date.now()) {
  const d = new Date(when);
  if (sameDay(when, now)) return `Today, ${clock(when)}`;
  if (sameDay(when, now + DAY)) return `Tomorrow, ${clock(when)}`;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${clock(when)}`;
}

/** "SATURDAY 31 OCTOBER" over the countdown. */
export function longDate(when) {
  const d = new Date(when);
  return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

/** The next seven days as chips: Today, Tomorrow, then "Mon 2". */
export function dayOptions(now = Date.now(), count = 7) {
  const first = startOfDay(now);
  return Array.from({ length: count }, (_, i) => {
    const at = new Date(first);
    at.setDate(at.getDate() + i);
    const d = at.getTime();
    return {
      id: String(d),
      at: d,
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${WEEKDAYS[at.getDay()]} ${at.getDate()}`,
    };
  });
}

/** A day's start plus an hour (0 to 23) and minute. */
export function atTime(day, hour, minute) {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

/** Whether `when` is far enough ahead to schedule. */
export const isSchedulable = (when, now = Date.now()) => Number.isFinite(when) && when - now >= MIN_LEAD_MS;

/**
 * The picker's starting point: the next quarter hour that is at least
 * fifteen minutes away, as a day and a time on the wheel.
 */
export function defaultSlot(now = Date.now()) {
  const step = 15 * MINUTE;
  const at = Math.ceil((now + 15 * MINUTE) / step) * step;
  const d = new Date(at);
  return { day: startOfDay(at), hour: d.getHours(), minute: d.getMinutes() };
}

/** One-tap choices, only the ones still ahead. */
export function quickSlots(now = Date.now()) {
  const today = startOfDay(now);
  const tomorrow = startOfDay(now + DAY);
  const slots = [
    { id: '15m', label: 'In 15 min', at: now + 15 * MINUTE },
    { id: '1h', label: 'In 1 hour', at: now + HOUR },
    { id: 'tonight', label: 'Tonight 8 PM', at: atTime(today, 20, 0) },
    { id: 'tomorrow', label: 'Tomorrow 9 AM', at: atTime(tomorrow, 9, 0) },
  ];
  const seen = new Set();
  return slots.filter((s) => {
    const fresh = isSchedulable(s.at, now) && !seen.has(s.at);
    seen.add(s.at);
    return fresh;
  });
}

/** A new room id: a v4 UUID, from Crypto where there is one. */
export function newRoomId(crypto) {
  const id = crypto?.randomUUID?.();
  if (id) return id;
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => (c === 'x' ? hex() : ((Math.random() * 4) | 8).toString(16)));
}
