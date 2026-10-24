// One sound at a time: the radio (or a podcast) and Zen's soundscapes never
// play together. Each engine registers how to stop itself, and claims the
// focus as it starts; claiming stops whichever other one is playing, at
// once. No imports, so either engine can use it without a cycle.
const owners = new Map(); // name -> stop()
// Who claimed the focus last: the sound the app is "on" (playing or
// paused), which the mini player shows.
let active = null;
const watchers = new Set();

/** Registers how `name` stops; returns an unregister function. */
export function register(name, stop) {
  owners.set(name, stop);
  return () => {
    if (owners.get(name) === stop) owners.delete(name);
  };
}

/** The engine that played last ('radio', 'zen'), or null. */
export const activeOwner = () => active;

/** Calls fn(owner) whenever another engine takes over; returns an unsubscribe. */
export function subscribeActive(fn) {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

/** `name` is about to play: every other engine stops now. */
export function claim(name) {
  if (active !== name) {
    active = name;
    watchers.forEach((fn) => fn(name));
  }
  owners.forEach((stop, other) => {
    if (other === name) return;
    try {
      stop();
    } catch (err) {
      console.warn(`[audio] couldn't stop ${other}`, err?.message ?? err);
    }
  });
}

/** The engine `name` has nothing loaded any more: it's no longer the active one. */
export function release(name) {
  if (active !== name) return;
  active = null;
  watchers.forEach((fn) => fn(null));
}
