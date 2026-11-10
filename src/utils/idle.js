// Runs work when the app has a quiet moment. React Native 0.88 removed
// InteractionManager; its replacement is requestIdleCallback, which runs the
// callback between frames, once the JS thread has nothing else to do. Where
// that isn't there (tests), a short timer stands in.

/**
 * Calls `fn` when the JS thread is idle, within `timeout` ms at the latest.
 * Returns a function that cancels it.
 */
export function whenIdle(fn, timeout = 1500) {
  const ric = globalThis.requestIdleCallback;
  if (typeof ric === 'function') {
    const id = ric(() => fn(), { timeout });
    return () => globalThis.cancelIdleCallback?.(id);
  }
  const id = setTimeout(fn, 0);
  return () => clearTimeout(id);
}
