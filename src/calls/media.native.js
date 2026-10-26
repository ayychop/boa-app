import { PermissionsAndroid, Platform } from 'react-native';
import { createAgoraRtcEngine, RtcSurfaceView } from 'react-native-agora';
import { fetchToken } from './token';
import { toAgora } from './beauty';
import { AUDIO, CAPTURE, DENOISER, ENCODER, LOW_LIGHT } from './quality';

// The picture and sound of a BOA video call, over Agora. Ringing stays on
// Supabase Realtime (src/calls/signaling.js); once both phones agree, each
// one joins the Agora channel named by the call's id with a token from our
// own backend (src/calls/token.js).
//
// One engine for the app's life, set up for quality the first time it's
// needed (src/calls/quality.js): 1080p, quality-first encoding and the
// low-light pipeline. Each call only previews, joins and leaves.

export const available = true;

let engine = null;
let engineAppId = null;
let session = null; // { channel, token, uid, camera, mic, joined, handler }

const CHANNEL_COMMUNICATION = 0;
const ROLE_BROADCASTER = 1;
const RENDER_HIDDEN = 1; // fill the view, cropping the edges
const REMOTE_STOPPED = 0;
const REMOTE_FAILED = 4;
const CONNECTION_RECONNECTING = 4;
const CONNECTION_FAILED = 5;
const CONNECTION_CONNECTED = 3;

async function permissions() {
  if (Platform.OS !== 'android') return { camera: true, mic: true };
  const P = PermissionsAndroid.PERMISSIONS;
  const res = await PermissionsAndroid.requestMultiple([P.CAMERA, P.RECORD_AUDIO]);
  const ok = (p) => res?.[p] === PermissionsAndroid.RESULTS.GRANTED;
  return { camera: ok(P.CAMERA), mic: ok(P.RECORD_AUDIO) };
}

function setup(appId) {
  if (engine && engineAppId === appId) return engine;
  engine?.release();
  engine = createAgoraRtcEngine();
  engine.initialize({ appId, channelProfile: CHANNEL_COMMUNICATION, audioScenario: AUDIO.scenario });
  engineAppId = appId;
  engine.enableVideo();
  engine.setAudioProfile(AUDIO.profile, AUDIO.scenario);
  engine.setCameraCapturerConfiguration(CAPTURE);
  engine.setVideoEncoderConfiguration(ENCODER);
  // Any light: denoise first (low light's high-quality mode needs it), then
  // lift dark rooms. Both are auto, so a well-lit face is left alone.
  engine.setVideoDenoiserOptions(true, DENOISER);
  engine.setLowlightEnhanceOptions(true, LOW_LIGHT);
  // Focus and expose for the face, not the window behind it.
  engine.setCameraAutoFocusFaceModeEnabled(true);
  engine.setCameraAutoExposureFaceModeEnabled?.(true);
  engine.setDefaultAudioRouteToSpeakerphone(true);
  return engine;
}

/** Applies BOA Filters (src/calls/beauty.js) to your camera. */
export function setBeauty(beauty) {
  if (!engine) return;
  const { beauty: b, colorEnhance: c } = toAgora(beauty);
  engine.setBeautyEffectOptions(b.enabled, b);
  engine.setColorEnhanceOptions(c.enabled, c);
}

/**
 * Gets the call's token and turns the camera on, so you see yourself while
 * it rings. Safe to call twice; join() calls it if nobody has. Resolves to
 * false if the call ended meanwhile.
 */
export async function prepare(channel, beauty) {
  if (session?.channel === channel) return session.ready;
  const s = { channel, joined: false };
  session = s;
  s.ready = (async () => {
    const [pass, perm] = await Promise.all([fetchToken(channel), permissions()]);
    if (session !== s) return false;
    Object.assign(s, { token: pass.token, uid: pass.uid, camera: perm.camera, mic: perm.mic });
    setup(pass.appId);
    setBeauty(beauty);
    if (s.camera) engine.startPreview();
    return true;
  })();
  return s.ready;
}

/**
 * Joins the call's channel. onEvent gets patches for the call screen:
 * { status: 'connecting' | 'connected' | 'reconnecting' | 'failed' },
 * { remoteUid }, { remoteVideo }.
 */
export async function join(channel, { beauty, controls, onEvent }) {
  onEvent({ status: 'connecting' });
  let ok;
  try {
    ok = await prepare(channel, beauty);
  } catch (err) {
    if (session?.channel === channel) onEvent({ status: 'failed', error: err.message });
    return;
  }
  const s = session;
  if (!ok || s?.channel !== channel || s.joined) return;
  s.handler = {
    onJoinChannelSuccess: () => onEvent({ status: 'connected' }),
    onUserJoined: (_c, remoteUid) => onEvent({ remoteUid }),
    onUserOffline: (_c, remoteUid) => onEvent({ remoteUid: null, remoteVideo: false, gone: remoteUid }),
    onRemoteVideoStateChanged: (_c, remoteUid, state) =>
      onEvent({ remoteUid, remoteVideo: state !== REMOTE_STOPPED && state !== REMOTE_FAILED }),
    onConnectionStateChanged: (_c, state) => {
      if (state === CONNECTION_RECONNECTING) onEvent({ status: 'reconnecting' });
      else if (state === CONNECTION_FAILED) onEvent({ status: 'failed' });
      else if (state === CONNECTION_CONNECTED) onEvent({ status: 'connected' });
    },
    onTokenPrivilegeWillExpire: async () => {
      try {
        const pass = await fetchToken(channel);
        if (session === s) engine.renewToken(pass.token);
      } catch {
        // The current token still has a little while; the next warning retries.
      }
    },
  };
  engine.registerEventHandler(s.handler);
  engine.joinChannel(s.token, channel, s.uid, {
    channelProfile: CHANNEL_COMMUNICATION,
    clientRoleType: ROLE_BROADCASTER,
    publishCameraTrack: s.camera,
    publishMicrophoneTrack: s.mic,
    autoSubscribeAudio: true,
    autoSubscribeVideo: true,
  });
  s.joined = true;
  setMuted(!!controls?.muted);
  setCameraOff(!!controls?.cameraOff);
  setSpeaker(controls?.speaker !== false);
}

/** Leaves the call and lets go of the camera and microphone. */
export function leave() {
  const s = session;
  session = null;
  if (!engine || !s) return;
  if (s.handler) engine.unregisterEventHandler(s.handler);
  engine.stopPreview();
  if (s.joined) engine.leaveChannel();
}

/** Mute: the microphone keeps running (no click on unmute) but nothing is sent. */
export function setMuted(muted) {
  engine?.muteLocalAudioStream(muted);
}

/** Camera off really turns the camera off, not just the picture. */
export function setCameraOff(off) {
  if (!engine || !session?.camera) return;
  engine.enableLocalVideo(!off);
  engine.muteLocalVideoStream(off);
  if (!off && session.joined) engine.updateChannelMediaOptions({ publishCameraTrack: true });
}

export function setSpeaker(on) {
  if (session?.joined) engine?.setEnableSpeakerphone(on);
}

/** You, from your camera. */
export function LocalVideo({ style }) {
  return <RtcSurfaceView canvas={{ uid: 0, renderMode: RENDER_HIDDEN }} zOrderMediaOverlay style={style} testID="call-local-video" />;
}

/** The other person. */
export function RemoteVideo({ uid, style }) {
  return <RtcSurfaceView canvas={{ uid, renderMode: RENDER_HIDDEN }} style={style} testID="call-remote-video" />;
}
