import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// Radio alarms that ring with the app closed (Android). The phone itself
// sets an exact system alarm, and at the time a foreground service plays the
// station at alarm volume, with BOA's chimes covering any gap, so nothing
// depends on the app being open or on a background JavaScript task, which
// Android may stop at any time. Elsewhere, and in builds without the native
// module, radio alarms stay what they were: a notification that tunes in
// when it's opened.
const native = Platform.OS === 'android' ? requireOptionalNativeModule('BoaAlarm') : null;

export const isAvailable = !!native;

/** Android lets BOA set alarms at an exact minute (true off Android). */
export function canScheduleExact() {
  try {
    return native?.canScheduleExact ? !!native.canScheduleExact() : true;
  } catch {
    return true;
  }
}

/**
 * Hands the phone the station alarms: [{ id, name, hour, minute, days, station, url }].
 * Replaces the last list; an empty list cancels them all. Returns how many were set.
 */
export function sync(alarms) {
  if (!native?.sync) return 0;
  try {
    return native.sync(JSON.stringify(alarms));
  } catch (err) {
    console.warn('[alarms] native sync failed', err?.message ?? err);
    return 0;
  }
}

/** Ids of once-only alarms that rang while the app was closed (and forgets them). */
export function takeFired() {
  try {
    return native?.takeFired ? native.takeFired() : [];
  } catch {
    return [];
  }
}

/** The alarm ringing now: { id, name, station }, or null. */
export function current() {
  try {
    return native?.current ? native.current() : null;
  } catch {
    return null;
  }
}

export const stop = () => {
  try {
    native?.stop?.();
  } catch {}
};

export const snooze = () => {
  try {
    native?.snooze?.();
  } catch {}
};

/** Opens BOA's battery settings, where "Unrestricted" stops the phone putting the app to sleep. */
export function openBatterySettings() {
  try {
    return !!native?.openBatterySettings?.();
  } catch {
    return false;
  }
}

/** fn({ state: 'ringing' | 'stopped' | 'snoozed', id, name, station }); returns unsubscribe. */
export function addAlarmListener(fn) {
  if (!native) return () => {};
  const sub = native.addListener('onAlarmState', fn);
  return () => sub.remove();
}
