import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// The home screen widget bridge (Android). Everywhere else, and in builds
// without the native module, every call quietly does nothing.
const native = Platform.OS === 'android' ? requireOptionalNativeModule('BoaWidget') : null;

export const isAvailable = !!native;

// Record artwork per station (file:// PNGs from components/RecordArtwork),
// and what was last sent, so artwork that arrives after the station started
// still reaches the widget.
const artwork = new Map();
let last = null; // { title, subtitle, id, playing }

export function setStyle(color, opacity) {
  return native ? native.setStyle(color, opacity).catch(() => {}) : Promise.resolve();
}

/** The widget's style: 'glass', 'compact' or 'record'. */
export function setLayout(layout) {
  return native?.setLayout ? native.setLayout(layout).catch(() => {}) : Promise.resolve();
}

/** Glass only: weather on the left, clock on the right. */
export function setFlipped(flipped) {
  return native?.setFlipped ? native.setFlipped(!!flipped).catch(() => {}) : Promise.resolve();
}

function send() {
  if (!native) return Promise.resolve();
  const { title = null, subtitle = null, id = null, playing = false } = last ?? {};
  return native.setNowPlaying(title, subtitle, (id && artwork.get(id)) || null, !!playing).catch(() => {});
}

/**
 * What's playing: the station name, the line under it, the station's id
 * (for its record artwork) and whether it's on air. A null title shows the
 * BOA logo and "Tap to tune in".
 */
export function setNowPlaying(title, subtitle, id = null, playing = false) {
  last = { title: title ?? null, subtitle: subtitle ?? null, id: title ? id : null, playing };
  return send();
}

/** The rendered record for a station; redraws if that station is on. */
export function setArtwork(id, uri) {
  if (!id || !uri || artwork.get(id) === uri) return Promise.resolve();
  artwork.set(id, uri);
  return last?.id === id ? send() : Promise.resolve();
}

/** Today's weather for the widget, or null to clear it (see api/weather.js). */
export function setWeather(w) {
  if (!native) return Promise.resolve();
  return native
    .setWeather(w?.temp ?? null, w?.icon ?? null, w?.place ?? null, w?.detail ?? null)
    .catch(() => {});
}

export function count() {
  return native ? native.count().catch(() => 0) : Promise.resolve(0);
}
