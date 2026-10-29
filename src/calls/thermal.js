import * as BoaCall from '../../modules/boa-call';

// The phone's thermal state for video calls. WARNING and CRITICAL drop the
// camera to 720p60 (src/calls/quality.js COOL_ENCODER) so the silicon can
// cool without the picture looking choppy. Android reports it from
// PowerManager (modules/boa-call); tests push a state with setState.

export const NOMINAL = 'NOMINAL';
export const FAIR = 'FAIR';
export const WARNING = 'WARNING';
export const CRITICAL = 'CRITICAL';

const HOT = new Set([WARNING, CRITICAL]);

let state = NOMINAL;
const listeners = new Set();
let unsubNative = null;

export const current = () => state;

export const isHot = (s = state) => HOT.has(s);

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

/** Tests, and the native listener, push a new state. */
export function setState(next) {
  const value = HOT.has(next) || next === FAIR || next === NOMINAL ? next : NOMINAL;
  if (value === state) return;
  state = value;
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch {}
  });
}

/** Start listening to the phone. Safe to call often; one native subscription. */
export function start() {
  if (unsubNative || !BoaCall.addThermalListener) return;
  unsubNative = BoaCall.addThermalListener(setState);
}

export function stop() {
  unsubNative?.();
  unsubNative = null;
}
