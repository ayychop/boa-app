import { useSyncExternalStore } from 'react';

/**
 * Whether the phone has a connection, from @react-native-community/netinfo.
 *
 * Offline means NetInfo says it isn't connected, or is connected to a network
 * with no internet (a Wi-Fi with no way out, Flight Mode with Wi-Fi left on).
 * "Unknown" counts as online, so the app never claims to be offline on a
 * guess. If the native module isn't in this build the app is simply never
 * offline (everything streams as before).
 */
let NetInfo = null;
try {
  const mod = require('@react-native-community/netinfo');
  NetInfo = mod?.default ?? mod;
} catch {
  NetInfo = null;
}

let offline = false;
const listeners = new Set();

/** NetInfo's state, as offline or not. */
export const isOfflineState = (s) => !!s && (s.isConnected === false || s.isInternetReachable === false);

function apply(state) {
  const next = isOfflineState(state);
  if (next === offline) return;
  offline = next;
  listeners.forEach((fn) => fn(offline));
}

let started = false;
/** Starts watching (once). Called at app start and by the first listener. */
export function startNetwork() {
  if (started || !NetInfo?.addEventListener) return;
  started = true;
  try {
    NetInfo.addEventListener(apply);
    NetInfo.fetch?.()
      .then(apply)
      .catch(() => {});
  } catch {
    started = false;
  }
}

export const isOffline = () => offline;

/** fn(offline: boolean) on every change; returns an unsubscribe. */
export function subscribeOffline(fn) {
  startNetwork();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True while there is no internet: the "Offline Mode" state. */
export function useOffline() {
  return useSyncExternalStore(subscribeOffline, isOffline, () => false);
}

startNetwork();
