import * as ScreenCapture from 'expo-screen-capture';
import { isAvailable as screenAvailable, setSecure } from '../../modules/boa-screen';

// Privacy Mode: while it's on, this phone won't take screenshots or screen
// recordings of the call (Android's secure window, iOS hides the screen in
// recordings), and the other person is told over the call's Agora data
// stream so their screen can say so.
//
// The message is tiny JSON, sent as plain bytes: { type: 'privacy', active }.

/**
 * Turns screenshots off (true) or back on (false) for this phone.
 *
 * A screenshot is taken by the phone that is LOOKING at the picture, so
 * Privacy Mode has to be enforced on both phones: key 'call' is your own
 * Privacy Mode, key 'remote' is them having turned theirs on (see
 * CallContext). The window stays protected while either key holds it.
 *
 * Android goes through BoaScreen's FLAG_SECURE holders (shared with
 * view-once media, so neither can switch the other's protection off);
 * iOS and builds without the module use expo-screen-capture, keyed the same.
 */
export function blockScreenshots(on, key = 'call') {
  const fallback = () => {
    try {
      (on ? ScreenCapture.preventScreenCaptureAsync(key) : ScreenCapture.allowScreenCaptureAsync(key))?.catch?.(() => {});
    } catch {
      // Not supported here (the web): nothing to block.
    }
  };
  if (!screenAvailable) return fallback();
  setSecure(!!on, key)
    .then((ok) => {
      if (!ok) fallback();
    })
    .catch(fallback);
}

/** The data stream message for Privacy Mode on or off. */
export function encodePrivacy(active) {
  const text = JSON.stringify({ type: 'privacy', active: !!active });
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

/** A data stream message back to { type, active }, or null if it isn't one of ours. */
export function decodeMessage(data) {
  try {
    const msg = JSON.parse(String.fromCharCode(...data));
    return msg && typeof msg.type === 'string' ? msg : null;
  } catch {
    return null;
  }
}
