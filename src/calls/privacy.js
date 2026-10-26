import * as ScreenCapture from 'expo-screen-capture';

// Privacy Mode: while it's on, this phone won't take screenshots or screen
// recordings of the call (Android's secure window, iOS hides the screen in
// recordings), and the other person is told over the call's Agora data
// stream so their screen can say so.
//
// The message is tiny JSON, sent as plain bytes: { type: 'privacy', active }.

/** Turns screenshots off (true) or back on (false) for this phone. */
export function blockScreenshots(on) {
  try {
    (on ? ScreenCapture.preventScreenCaptureAsync() : ScreenCapture.allowScreenCaptureAsync())?.catch?.(() => {});
  } catch {
    // Not supported here (the web): nothing to block.
  }
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
