// Video calls carry no picture or sound on the web build (Agora's SDK here
// is native only); src/calls/media.native.js is the phone version. Same
// API, so the call screen doesn't need to know.

export const available = false;
export const prepare = async () => false;
export const warmUp = async () => false;
export const forget = () => {};
export const reset = () => {};
export const join = async (_channel, { onEvent }) => onEvent({ status: 'failed', error: 'Video calls work in the BOA HUB app.' });
export const leave = () => {};
export const setMuted = () => {};
export const setCameraOff = () => {};
export const setAway = () => {};
export const setSpeaker = () => {};
export const switchCamera = () => {};
export const setPrivacy = () => {};
export const setBeauty = () => {};
export const setBrightness = () => {};
export const setContrast = () => {};
export const cameraFacing = () => 'front';
export const onFacing = () => () => {};
export const LocalVideo = () => null;
export const RemoteVideo = () => null;
