import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { createAudioPlayer } from 'expo-audio';
import { ALARM_SOUNDS, alarmSoundById, formatTime, nextRing, SNOOZE_MINUTES } from '../data/alarms';
import * as BoaAlarm from '../../modules/boa-alarm';
import { usePlayer } from './PlayerContext';

const STORE_KEY = 'boa.alarms.v1';
// The app, if it's open at the time (by the bed in Zen), checks this often.
const TICK_MS = 15000;

const AlarmContext = createContext(null);

const channelFor = (soundId) => `boa-alarm-${soundId}`;

// One channel per wake-up sound: on Android a channel's sound is fixed.
// Alarm usage, so it rings at alarm volume and through Do Not Disturb.
async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  await Promise.all(
    ALARM_SOUNDS.map((s) =>
      Notifications.setNotificationChannelAsync(channelFor(s.id), {
        name: `Alarm: ${s.label}`,
        importance: Notifications.AndroidImportance.MAX,
        sound: s.file,
        vibrationPattern: [0, 600, 400, 600],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
        audioAttributes: { usage: Notifications.AndroidAudioUsage.ALARM },
      }).catch(() => null),
    ),
  );
}

/** The sound a notification rings with: a radio alarm rings the chimes until the app opens the station. */
const toneFor = (alarm) => (alarm.sound?.type === 'tone' ? alarmSoundById(alarm.sound.id) : alarmSoundById('chimes'));

/**
 * A radio alarm the phone rings by itself (modules/boa-alarm): an exact system
 * alarm and a foreground service that plays the stream, with the app closed.
 * Only where that native module exists and the station has a stream.
 */
export const isNativeRadio = (alarm) => !!BoaAlarm.isAvailable && alarm?.sound?.type === 'station' && !!alarm.sound.station?.streamUrl;

const nativeShape = (a) => ({
  id: a.id,
  name: a.name || 'BOA Alarm',
  hour: a.hour,
  minute: a.minute,
  days: a.days ?? [],
  station: a.sound.station.name ?? '',
  url: a.sound.station.streamUrl,
});

/** Schedules one alarm's notifications; returns their ids. */
async function schedule(alarm) {
  if (!alarm.enabled) return [];
  // The phone rings these itself (a notification as well would ring twice).
  if (isNativeRadio(alarm)) return [];
  const tone = toneFor(alarm);
  const content = {
    title: alarm.name || 'BOA Alarm',
    body: alarm.sound?.type === 'station' ? `Waking up to ${alarm.sound.station.name}` : `${formatTime(alarm.hour, alarm.minute)} · Good morning`,
    sound: tone.file,
    priority: Notifications.AndroidNotificationPriority.MAX,
    data: { alarmId: alarm.id, url: `network.boa://alarm/${alarm.id}` },
  };
  const channelId = channelFor(tone.id);
  const days = alarm.days ?? [];
  if (!days.length) {
    const date = nextRing(alarm);
    if (!date) return [];
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId, delivery: 'alarmClock' },
    });
    return [id];
  }
  return Promise.all(
    days.map((day) =>
      Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          // expo-notifications counts Sunday as 1.
          weekday: day + 1,
          hour: alarm.hour,
          minute: alarm.minute,
          channelId,
          delivery: 'alarmClock',
        },
      }),
    ),
  );
}

export function newAlarm(partial = {}) {
  const at = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return {
    id: `alarm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: 'Wake up',
    hour: at.getHours(),
    minute: Math.round(at.getMinutes() / 5) * 5 % 60,
    days: [],
    sound: { type: 'tone', id: 'bowl' },
    enabled: true,
    ...partial,
  };
}

/**
 * BOA alarms: a name, a time, the days it repeats, and what it wakes you to
 * (one of the bundled sounds, or a BOA Radio station). Each is a scheduled
 * notification with its sound, so it rings with the app closed; tapping it
 * (or the app being open at the time) brings up the ringing screen, which
 * loops the sound or tunes in the station, with Snooze and Stop.
 */
export function AlarmProvider({ children }) {
  const player = usePlayer();
  const [alarms, setAlarms] = useState([]);
  const [ready, setReady] = useState(false);
  const [ringing, setRinging] = useState(null); // the alarm going off
  const [permission, setPermission] = useState('unknown'); // granted | denied | unknown
  // Android 12+: may BOA set alarms at an exact minute? Off by default on Android 14+.
  const [exact, setExact] = useState('unknown'); // granted | denied | unknown
  const nativeRinging = useRef(false); // the phone (not the app) is playing the alarm
  const scheduled = useRef({}); // alarm id -> notification ids
  const lastFired = useRef({}); // alarm id -> minute key, so it rings once
  const tone = useRef(null);
  const alarmsRef = useRef(alarms);
  alarmsRef.current = alarms;

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then((raw) => {
        if (!raw) return;
        // Once-only alarms the phone rang while the app was closed are over.
        const fired = new Set(BoaAlarm.takeFired());
        const list = JSON.parse(raw).map((a) => (fired.has(a.id) && !a.days?.length ? { ...a, enabled: false } : a));
        setAlarms(list);
      })
      .catch(() => {})
      .finally(() => setReady(true));
    Notifications.getPermissionsAsync()
      .then((p) => setPermission(p.granted ? 'granted' : p.canAskAgain === false ? 'denied' : 'unknown'))
      .catch(() => {});
  }, []);

  // Reschedules everything whenever the list changes: cheap, and never out of step.
  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORE_KEY, JSON.stringify(alarms)).catch(() => {});
    let cancelled = false;
    (async () => {
      try {
        await ensureChannels();
        // The station alarms the phone rings itself, replacing the last list.
        BoaAlarm.sync(alarms.filter((a) => a.enabled && isNativeRadio(a)).map(nativeShape));
        const old = Object.values(scheduled.current).flat();
        await Promise.all(old.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
        const next = {};
        for (const a of alarms) {
          if (cancelled) return;
          next[a.id] = await schedule(a).catch(() => []);
        }
        scheduled.current = next;
      } catch (err) {
        console.warn('[alarms] scheduling failed', err?.message ?? err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [alarms, ready]);

  const stopTone = useCallback(() => {
    try {
      tone.current?.pause();
      tone.current?.remove();
    } catch {}
    tone.current = null;
  }, []);

  /** Goes off: the ringing screen, and the sound or station. */
  const ring = useCallback(
    (alarm, { fromPhone = false } = {}) => {
      if (!alarm) return;
      lastFired.current[alarm.id] = `${new Date().toDateString()} ${alarm.hour}:${alarm.minute}`;
      // The navigator shows the ringing screen (see App.js).
      setRinging(alarm);
      if (fromPhone || (isNativeRadio(alarm) && BoaAlarm.current()?.id === alarm.id)) {
        // The phone is already playing it (foreground service): this screen
        // only shows it, and Stop and Snooze go to the phone.
        nativeRinging.current = true;
      } else if (alarm.sound?.type === 'station' && alarm.sound.station) {
        stopTone();
        player.play(alarm.sound.station, [alarm.sound.station]);
      } else {
        stopTone();
        try {
          const p = createAudioPlayer(toneFor(alarm).asset);
          p.loop = true;
          p.play();
          tone.current = p;
        } catch (err) {
          console.warn('[alarms] tone failed', err?.message ?? err);
        }
      }
      // A one-off alarm turns itself off once it has rung.
      if (!alarm.days?.length) setAlarms((list) => list.map((a) => (a.id === alarm.id ? { ...a, enabled: false } : a)));
    },
    [player, stopTone],
  );

  const stop = useCallback(() => {
    stopTone();
    if (nativeRinging.current) {
      nativeRinging.current = false;
      BoaAlarm.stop();
    } else if (ringing?.sound?.type === 'station') player.pause();
    setRinging(null);
  }, [ringing, player, stopTone]);

  const snooze = useCallback(() => {
    const alarm = ringing;
    const byPhone = nativeRinging.current;
    if (byPhone) {
      // The phone sets the snooze itself (and stops the radio).
      nativeRinging.current = false;
      BoaAlarm.snooze();
      stopTone();
      setRinging(null);
      return;
    }
    stop();
    if (!alarm) return;
    const at = new Date(Date.now() + SNOOZE_MINUTES * 60000);
    const t = toneFor(alarm);
    Notifications.scheduleNotificationAsync({
      content: { title: `${alarm.name || 'BOA Alarm'} (snoozed)`, sound: t.file, data: { alarmId: alarm.id, snooze: true } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: channelFor(t.id), delivery: 'alarmClock' },
    }).catch(() => {});
  }, [ringing, stop]);

  // Tapped from the notification (or the app open when it arrives).
  useEffect(() => {
    const byId = (id) => alarmsRef.current.find((a) => a.id === id);
    const received = Notifications.addNotificationReceivedListener((n) => {
      const id = n.request.content.data?.alarmId;
      if (id && AppState.currentState === 'active') ring(byId(id));
    });
    const responded = Notifications.addNotificationResponseReceivedListener((r) => {
      const id = r.notification.request.content.data?.alarmId;
      if (id) ring(byId(id));
    });
    return () => {
      received.remove();
      responded.remove();
    };
  }, [ring]);

  // The phone's own alarm (the radio, with the app closed or open): show it,
  // and close the screen when it's stopped or snoozed from the notification
  // or the lock-screen page.
  useEffect(() => {
    const show = (e) => {
      const known = alarmsRef.current.find((a) => a.id === e.id);
      return (
        known ?? {
          id: e.id,
          name: e.name || 'BOA Alarm',
          hour: new Date().getHours(),
          minute: new Date().getMinutes(),
          days: [],
          enabled: true,
          sound: { type: 'station', station: { name: e.station } },
        }
      );
    };
    const unsub = BoaAlarm.addAlarmListener((e) => {
      if (e?.state === 'ringing') ring(show(e), { fromPhone: true });
      else if (e?.state === 'stopped' || e?.state === 'snoozed') {
        nativeRinging.current = false;
        setRinging(null);
      }
    });
    // Opened (by a tap) while it was already ringing.
    const now = BoaAlarm.current();
    if (now) ring(show(now), { fromPhone: true });
    return unsub;
  }, [ring]);

  // Exact alarms: checked now and whenever the app comes back (it can be
  // turned on from the system screen, outside the app).
  const checkExact = useCallback(async () => {
    try {
      const r = await Notifications.getExactAlarmPermissionsAsync();
      setExact(r.granted ? 'granted' : 'denied');
      return !!r.granted;
    } catch {
      setExact('granted');
      return true;
    }
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    checkExact();
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      checkExact();
      // Once-only alarms the phone rang while the app was in the background.
      const fired = BoaAlarm.takeFired();
      if (fired.length) setAlarms((list) => list.map((a) => (fired.includes(a.id) && !a.days?.length ? { ...a, enabled: false } : a)));
    });
    return () => sub.remove();
  }, [checkExact]);

  /** Opens the system screen where BOA may set exact alarms; true once it can. */
  const askExact = useCallback(async () => {
    try {
      const r = await Notifications.requestExactAlarmPermissionsAsync();
      setExact(r.granted ? 'granted' : 'denied');
      if (r.granted) setAlarms((list) => [...list]); // set them all again, now exact
      return !!r.granted;
    } catch {
      return false;
    }
  }, []);

  // While the app is open, it rings on time even if notifications are off.
  useEffect(() => {
    const id = setInterval(() => {
      if (ringing) return;
      const now = new Date();
      for (const a of alarmsRef.current) {
        if (!a.enabled || a.hour !== now.getHours() || a.minute !== now.getMinutes()) continue;
        // The phone rings these itself and tells the app (above).
        if (isNativeRadio(a)) continue;
        if (a.days?.length && !a.days.includes(now.getDay())) continue;
        const key = `${now.toDateString()} ${a.hour}:${a.minute}`;
        if (lastFired.current[a.id] === key) continue;
        ring(a);
        return;
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [ring, ringing]);

  const askPermission = useCallback(async () => {
    try {
      const p = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true } });
      setPermission(p.granted ? 'granted' : 'denied');
      return p.granted;
    } catch {
      return false;
    }
  }, []);

  const save = useCallback(
    (alarm) => {
      setAlarms((list) => (list.some((a) => a.id === alarm.id) ? list.map((a) => (a.id === alarm.id ? alarm : a)) : [...list, alarm]));
      if (permission !== 'granted') askPermission();
      // Android may keep alarms to an approximate time until this is allowed.
      else if (exact === 'denied') askExact();
    },
    [permission, askPermission, exact, askExact],
  );
  const remove = useCallback((id) => setAlarms((list) => list.filter((a) => a.id !== id)), []);
  const toggle = useCallback((id) => setAlarms((list) => list.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a))), []);

  const value = useMemo(
    () => ({ alarms, ready, ringing, permission, exact, save, remove, toggle, ring, stop, snooze, askPermission, askExact }),
    [alarms, ready, ringing, permission, exact, save, remove, toggle, ring, stop, snooze, askPermission, askExact],
  );
  return <AlarmContext.Provider value={value}>{children}</AlarmContext.Provider>;
}

export function useAlarms() {
  const ctx = useContext(AlarmContext);
  if (!ctx) throw new Error('useAlarms must be used inside <AlarmProvider>');
  return ctx;
}
