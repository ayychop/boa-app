import AsyncStorage from '@react-native-async-storage/async-storage';

// Where you were, kept on the phone, so if Android ever has to restart the app
// (it was in the background and the phone needed the memory, or the phone was
// folded and unfolded) BOA opens where you left off instead of at the start.
//
// Only a recent visit is brought back, and never a screen that must not be
// reopened by itself: a ringing alarm, a sign in sheet, a half written post.

const KEY = 'boa.nav.v1';
// Longer than this and a fresh start is what people expect.
export const RESTORE_WITHIN_MS = 30 * 60 * 1000;
// Screens that are never reopened on their own.
export const NEVER_RESTORE = ['AlarmRinging', 'HubWelcome', 'HubNewPost', 'ScheduledCall', 'AdminDashboard'];

/** The navigation state without the screens in NEVER_RESTORE, or undefined if nothing is left. Pure. */
export function sanitizeNavState(state, banned = NEVER_RESTORE) {
  if (!state || !Array.isArray(state.routes) || !state.routes.length) return undefined;
  const routes = [];
  for (const route of state.routes) {
    if (typeof route?.name !== 'string' || banned.includes(route.name)) continue;
    const inner = route.state ? sanitizeNavState(route.state, banned) : undefined;
    // Screens with their own params (a profile id, a post) keep them; the key is regenerated.
    const { key: _key, state: _state, ...rest } = route;
    routes.push(inner ? { ...rest, state: inner } : rest);
  }
  if (!routes.length) return undefined;
  const { key: _k, routeNames: _r, ...rest } = state;
  const index = Math.min(Math.max(0, typeof state.index === 'number' ? state.index : routes.length - 1), routes.length - 1);
  return { ...rest, routes, index, stale: true };
}

/** Saves the current state (call it from onStateChange). Never throws. */
export async function saveNavState(state, now = Date.now()) {
  try {
    const clean = sanitizeNavState(state);
    if (!clean) return;
    await AsyncStorage.setItem(KEY, JSON.stringify({ at: now, state: clean }));
  } catch {}
}

/** The state to start from, or undefined for a normal start. */
export async function loadNavState(now = Date.now()) {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(KEY)) || 'null');
    if (!saved?.state || typeof saved.at !== 'number' || now - saved.at > RESTORE_WITHIN_MS) return undefined;
    return sanitizeNavState(saved.state);
  } catch {
    return undefined;
  }
}

export const forgetNavState = () => AsyncStorage.removeItem(KEY).catch(() => {});
