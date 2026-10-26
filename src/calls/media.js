// Video calls carry no picture or sound on the web build (Agora's SDK here
// is native only); src/calls/media.native.js is the phone version. Same
// API, so the call screen doesn't need to know.

export const available = false;
export const prepare = async () => false;
export const join = async (_channel, { onEvent }) => onEvent({ status: 'failed', error: 'Video calls work in the BOA HUB app.' });
export const leave = () => {};
export const setMuted = () => {};
export const setCameraOff = () => {};
export const setSpeaker = () => {};
export const setBeauty = () => {};
export const LocalVideo = () => null;
export const RemoteVideo = () => null;
