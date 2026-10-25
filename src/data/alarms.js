// Wake-up sounds for BOA alarms: openly licensed recordings from Wikimedia
// Commons, trimmed to about 25 seconds (a notification sound's limit) and
// bundled as WAV in assets/sounds, so they ring with the app closed. The
// expo-notifications plugin (app.json) copies them into the native build.
export const ALARM_SOUNDS = [
  {
    id: 'bowl',
    label: 'Singing bowl',
    detail: 'A slow, warm ring',
    icon: 'radio-button-on-outline',
    file: 'alarm_bowl.wav',
    asset: require('../../assets/sounds/alarm_bowl.wav'),
    title: 'Singing bowl',
    author: 'BambooBeast',
    license: 'Public domain',
    source: 'https://commons.wikimedia.org/wiki/File:SingingBowl1.ogg',
  },
  {
    id: 'chimes',
    label: 'Koshi chimes',
    detail: 'Wind chimes, gently rising',
    icon: 'leaf-outline',
    file: 'alarm_chimes.wav',
    asset: require('../../assets/sounds/alarm_chimes.wav'),
    title: 'Windglockenspiel (Koshi)',
    author: 'Membeth',
    license: 'CC0',
    source: 'https://commons.wikimedia.org/wiki/File:Windglockenspiel.Koshi.ogg',
  },
  {
    id: 'classic',
    label: 'Classic bell',
    detail: 'The alarm clock, for heavy sleepers',
    icon: 'alarm-outline',
    file: 'alarm_classic.wav',
    asset: require('../../assets/sounds/alarm_classic.wav'),
    title: 'Alarm Clock',
    author: 'Yoo-toob-FX (directory.audio)',
    license: 'CC0',
    source: 'https://commons.wikimedia.org/wiki/File:Alarm_Clock_(Directory.Audio).mp3',
  },
];

export const alarmSoundById = (id) => ALARM_SOUNDS.find((s) => s.id === id) ?? ALARM_SOUNDS[0];

// Monday first, as the week is printed in the UK.
export const WEEKDAYS = [
  { day: 1, short: 'M', label: 'Monday' },
  { day: 2, short: 'T', label: 'Tuesday' },
  { day: 3, short: 'W', label: 'Wednesday' },
  { day: 4, short: 'T', label: 'Thursday' },
  { day: 5, short: 'F', label: 'Friday' },
  { day: 6, short: 'S', label: 'Saturday' },
  { day: 0, short: 'S', label: 'Sunday' },
];

export const SNOOZE_MINUTES = 9;

/** The next time an alarm rings after `from` (a Date), or null if it never will. */
export function nextRing(alarm, from = new Date()) {
  if (!alarm?.enabled) return null;
  const at = new Date(from);
  at.setSeconds(0, 0);
  at.setHours(alarm.hour, alarm.minute);
  const days = alarm.days ?? [];
  for (let i = 0; i < 8; i++) {
    const candidate = new Date(at);
    candidate.setDate(at.getDate() + i);
    if (candidate <= from) continue;
    if (!days.length || days.includes(candidate.getDay())) return candidate;
  }
  return null;
}

/** "Rings in 7 hr 20 min", for the editor and the list. */
export function ringsIn(alarm, from = new Date()) {
  const next = nextRing(alarm, from);
  if (!next) return 'Off';
  const mins = Math.round((next - from) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 24) return `Rings ${next.toLocaleDateString(undefined, { weekday: 'long' })}`;
  if (h === 0) return `Rings in ${m} min`;
  return `Rings in ${h} hr${m ? ` ${m} min` : ''}`;
}

/** Which days it repeats on, in words. */
export function repeatLabel(days = []) {
  if (!days.length) return 'Once';
  if (days.length === 7) return 'Every day';
  const set = new Set(days);
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'Weekdays';
  if (set.size === 2 && set.has(0) && set.has(6)) return 'Weekends';
  return WEEKDAYS.filter((w) => set.has(w.day))
    .map((w) => w.label.slice(0, 3))
    .join(', ');
}

/**
 * Alarms keep their hour in 24-hour form (0 to 23), which is what the
 * notification scheduling works from; people see and pick it in 12-hour
 * form with AM or PM. 0 is 12 AM (midnight), 12 is 12 PM (noon).
 */
export function to12h(hour) {
  return { hour12: hour % 12 === 0 ? 12 : hour % 12, pm: hour >= 12 };
}

/** The 24-hour hour for a 12-hour one (1 to 12) and AM or PM. */
export function to24h(hour12, pm) {
  return (hour12 % 12) + (pm ? 12 : 0);
}

/** "1:05" and "PM", for showing the two at different sizes. */
export function timeParts(hour, minute) {
  const { hour12, pm } = to12h(hour);
  return { time: `${hour12}:${String(minute).padStart(2, '0')}`, period: pm ? 'PM' : 'AM' };
}

/** "1:05 PM". */
export function formatTime(hour, minute) {
  const { time, period } = timeParts(hour, minute);
  return `${time} ${period}`;
}
