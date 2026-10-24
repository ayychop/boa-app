// One sound at a time: the radio (or a podcast) and Zen's soundscapes never
// play together. Each engine registers how to stop itself, and claims the
// focus as it starts; claiming stops whichever other one is playing, at
// once. No imports, so either engine can use it without a cycle.
const owners = new Map(); // name -> stop()

/** Registers how `name` stops; returns an unregister function. */
export function register(name, stop) {
  owners.set(name, stop);
  return () => {
    if (owners.get(name) === stop) owners.delete(name);
  };
}

/** `name` is about to play: every other engine stops now. */
export function claim(name) {
  owners.forEach((stop, other) => {
    if (other === name) return;
    try {
      stop();
    } catch (err) {
      console.warn(`[audio] couldn't stop ${other}`, err?.message ?? err);
    }
  });
}
