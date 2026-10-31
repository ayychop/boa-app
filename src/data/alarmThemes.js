import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BoaAlarm from '../../modules/boa-alarm';

// The look of the page the phone shows when a radio alarm rings (the native
// Kotlin AlarmActivity, modules/boa-alarm): six themes, chosen in Alarm
// Settings. The ids, names and colours mirror AlarmTheme.kt (the native side
// draws the real page; these draw the previews in the app), so keep the two
// in step.
//
// The choice is kept on the phone and handed to the native side whenever it
// changes and whenever the app starts, so the page that rings with the app
// closed already knows it.

const KEY = 'boa.alarm.theme.v1';

/**
 * bg: [top, bottom]; orbs: [colour, x, y, size] as fractions of the preview;
 * time: [from, to]; button: [from, to] and its text colour.
 */
export const ALARM_THEMES = [
  {
    id: 'gilded',
    name: 'Gilded',
    blurb: 'Black and gold, the house look',
    bg: ['#050506', '#0C0905'],
    orbs: [
      ['rgba(226,168,75,0.47)', 0.82, 0.1, 1.0],
      ['rgba(138,90,28,0.33)', 0.08, 0.88, 0.9],
    ],
    time: ['#FBE3A6', '#C98A2B'],
    text: '#F3EFE8',
    muted: '#A9A49B',
    accent: '#E2A84B',
    button: ['#F6D38A', '#E2A84B'],
    buttonText: '#050506',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    blurb: 'Teal and violet light on deep blue',
    bg: ['#03070C', '#070612'],
    orbs: [
      ['rgba(31,182,166,0.47)', 0.12, 0.14, 1.0],
      ['rgba(106,76,224,0.47)', 0.92, 0.56, 1.0],
      ['rgba(226,168,75,0.2)', 0.5, 0.96, 0.7],
    ],
    time: ['#F4F1E4', '#8FE3D6'],
    text: '#EEF3F2',
    muted: '#93A7A8',
    accent: '#7FE3D4',
    button: ['#D8F8F1', '#6FD6C6'],
    buttonText: '#03120F',
  },
  {
    id: 'sunrise',
    name: 'Sunrise',
    blurb: 'Amber and rose, rising from the edge',
    bg: ['#0A0507', '#1B0C08'],
    orbs: [
      ['rgba(255,138,76,0.53)', 0.5, 1.04, 1.35],
      ['rgba(255,94,122,0.4)', 0.06, 0.92, 0.95],
      ['rgba(255,195,107,0.27)', 0.94, 0.78, 0.85],
    ],
    time: ['#FFEBC8', '#FFB45A'],
    text: '#FBEFE3',
    muted: '#B8A395',
    accent: '#FFB45A',
    button: ['#FFDDA6', '#FF9B4F'],
    buttonText: '#1B0C08',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    blurb: 'Pure black. Only the time is lit',
    bg: ['#000000', '#000000'],
    orbs: [],
    time: ['#EBCB82', '#B8832C'],
    text: '#E9E5DC',
    muted: '#8D887F',
    accent: '#E2A84B',
    button: ['#E2A84B', '#E2A84B'],
    buttonText: '#000000',
  },
  {
    id: 'ivory',
    name: 'Ivory',
    blurb: 'Warm light, deep gold numerals',
    bg: ['#F8F2E6', '#E8DCC4'],
    orbs: [
      ['rgba(226,168,75,0.4)', 0.86, 0.08, 1.0],
      ['rgba(255,255,255,0.6)', 0.1, 0.8, 0.95],
    ],
    time: ['#B9791E', '#6F4710'],
    text: '#1B1710',
    muted: '#6F6554',
    accent: '#A9701C',
    button: ['#2B2319', '#12100C'],
    buttonText: '#F6D38A',
    light: true,
  },
  {
    id: 'ember',
    name: 'Ember',
    blurb: 'Burnt orange and red, banked like a fire',
    bg: ['#080304', '#140504'],
    orbs: [
      ['rgba(194,65,12,0.47)', 0.18, 0.18, 1.05],
      ['rgba(127,29,29,0.47)', 0.92, 0.72, 1.05],
      ['rgba(226,168,75,0.27)', 0.5, 0.56, 0.55],
    ],
    time: ['#F6D38A', '#D97A2B'],
    text: '#F5EAE0',
    muted: '#B09A8E',
    accent: '#E2733B',
    button: ['#F6C58A', '#E2733B'],
    buttonText: '#140504',
  },
];

export const DEFAULT_ALARM_THEME = 'gilded';
export const alarmThemeById = (id) => ALARM_THEMES.find((t) => t.id === id) ?? ALARM_THEMES[0];

let current = DEFAULT_ALARM_THEME;
let chosen = false;
const subs = new Set();
const emit = () => subs.forEach((fn) => fn());

// On start: read the choice, and tell the native side (it keeps its own copy
// for the page that rings with the app closed).
AsyncStorage.getItem(KEY)
  .then((raw) => {
    // Chosen while it was loading: that choice stands.
    if (chosen) return;
    if (raw) {
      const id = alarmThemeById(raw).id;
      if (id !== current) {
        current = id;
        emit();
      }
    }
    BoaAlarm.setTheme(current);
  })
  .catch(() => {});

export const getAlarmTheme = () => current;

export function setAlarmTheme(id) {
  const next = alarmThemeById(id).id;
  chosen = true;
  if (next !== current) {
    current = next;
    emit();
  }
  BoaAlarm.setTheme(next);
  AsyncStorage.setItem(KEY, next).catch(() => {});
}

export function subscribeAlarmTheme(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** The chosen alarm page's id; re-renders when it changes. */
export function useAlarmTheme() {
  return useSyncExternalStore(subscribeAlarmTheme, getAlarmTheme, getAlarmTheme);
}
