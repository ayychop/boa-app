// Native audio and video objects (players, views, surfaces) can be released
// by the system at any moment: the screen goes off, the app is sent to the
// background, a call or another app takes the audio. Calling into one that
// has gone throws, and a throw from a timer, a native event or a promise
// nobody awaits is a crash, not an error message. Anything that touches such
// an object goes through here: it never throws, and never leaves a rejected
// promise behind.

/** Runs `fn`; on a throw, logs it and returns `fallback`. */
export function safely(label, fn, fallback) {
  try {
    return fn();
  } catch (err) {
    console.warn(`[safe] ${label}`, err?.message ?? err);
    return fallback;
  }
}

/** Awaits `fn()`; on a throw or a rejection, logs it and returns `fallback`. */
export async function safelyAsync(label, fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[safe] ${label}`, err?.message ?? err);
    return fallback;
  }
}

/**
 * Wraps a listener so one that throws can never take down the emitter that
 * called it (and the listeners after it).
 */
export function guarded(label, fn) {
  return (...args) => safely(label, () => fn(...args));
}
