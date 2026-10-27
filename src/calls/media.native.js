import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import { createAgoraRtcEngine, RtcSurfaceView, RtcTextureView } from 'react-native-agora';
import { fetchToken } from './token';
import { toAgora } from './beauty';
import { decodeMessage, encodePrivacy } from './privacy';
import { AINS_BALANCED, AUDIO, AUDIO_PROCESSING, CAPTURE, DENOISER, ENCODER, LOW_LIGHT, PREVIEW, STABILIZATION_OFF, VIDEO_SCENARIO } from './quality';

// The picture and sound of a BOA video call, over Agora. Ringing stays on
// Supabase Realtime (src/calls/signaling.js); once both phones agree, each
// one joins the Agora channel named by the call's id with a token from our
// own backend (src/calls/token.js).
//
// The engine is set up ahead of time (warmUp, from the chat thread before
// the call button is tapped, and as soon as a call rings in), together with
// the call's token, so the first call after opening the app doesn't race a
// cold engine or a cold token function. A call that fails or never
// connects tears everything down (reset) and tries once more from scratch;
// only a second failure reaches the call screen.

export const available = true;

let engine = null;
let engineAppId = null;
let session = null; // { channel, token, uid, camera, mic, joined, live, speaker, privacy, streamId, handler, timer }
// Tokens fetched ahead of time, by channel: { pass, at }.
const passes = new Map();

/** How long a join may take before it's torn down and retried. */
export const JOIN_TIMEOUT_MS = 15000;
// A token is good for an hour (supabase/functions/agora-token); one fetched
// ahead is used for up to 45 minutes.
const PASS_FRESH_MS = 45 * 60 * 1000;

const CHANNEL_COMMUNICATION = 0;
const ROLE_BROADCASTER = 1;
const RENDER_HIDDEN = 1; // fill the view, cropping the edges
const REMOTE_STOPPED = 0;
const REMOTE_FAILED = 4;
const CONNECTION_RECONNECTING = 4;
const CONNECTION_FAILED = 5;
const CONNECTION_CONNECTED = 3;

/** What a call can't do without, for the alert. */
export function missingLabel({ camera, mic }) {
  if (!camera && !mic) return 'camera and microphone';
  if (!camera) return 'camera';
  if (!mic) return 'microphone';
  return null;
}

// Asked every call, before the engine starts (Android only asks once it's
// been allowed). If either is refused the call still goes ahead with what
// it has, and an alert says why they can't be seen or heard, with a way
// into Settings when Android won't ask again.
async function permissions() {
  if (Platform.OS !== 'android') return { camera: true, mic: true };
  const P = PermissionsAndroid.PERMISSIONS;
  const res = await PermissionsAndroid.requestMultiple([P.CAMERA, P.RECORD_AUDIO]);
  const ok = (p) => res?.[p] === PermissionsAndroid.RESULTS.GRANTED;
  const perm = { camera: ok(P.CAMERA), mic: ok(P.RECORD_AUDIO) };
  const missing = missingLabel(perm);
  if (missing) {
    const blocked = [P.CAMERA, P.RECORD_AUDIO].some((p) => res?.[p] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
    Alert.alert(
      `Allow your ${missing}`,
      `BOA video calls need your ${missing}. Without it, the other person can't ${perm.mic ? 'see' : perm.camera ? 'hear' : 'see or hear'} you.`,
      blocked
        ? [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) },
          ]
        : [{ text: 'OK' }],
    );
  }
  return perm;
}

function setup(appId) {
  if (engine && engineAppId === appId) return engine;
  engine?.release();
  engine = createAgoraRtcEngine();
  const code = engine.initialize({ appId, channelProfile: CHANNEL_COMMUNICATION, audioScenario: AUDIO.scenario });
  if (code < 0) {
    engine.release();
    engine = null;
    engineAppId = null;
    throw new Error(`Agora error ${-code}`);
  }
  engineAppId = appId;
  // Sound and picture both on before anything joins.
  engine.enableAudio();
  engine.enableVideo();
  engine.setAudioProfile(AUDIO.profile, AUDIO.scenario);
  // No echo: AEC, noise suppression and gain control, all on before any join.
  for (const p of AUDIO_PROCESSING) engine.setParameters(p);
  engine.setAINSMode(true, AINS_BALANCED);
  engine.setVideoScenario(VIDEO_SCENARIO);
  engine.enableDualStreamMode(false);
  engine.setCameraCapturerConfiguration(CAPTURE);
  // Stabilization holds back the first frames on Android; calls are handheld at arm's length anyway.
  engine.setCameraStabilizationMode?.(STABILIZATION_OFF);
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

/** The call's token: the one fetched ahead if it's still fresh, else a new one. */
async function passFor(channel) {
  const kept = passes.get(channel);
  if (kept && Date.now() - kept.at < PASS_FRESH_MS) return kept.pass;
  passes.delete(channel);
  return fetchToken(channel);
}

/**
 * Gets ready for a call before anyone taps anything: fetches the call's
 * token and starts the engine, with no camera or microphone yet. Resolves
 * once both are ready; rejects if the token can't be had. engine: false
 * fetches only the token (a call ringing in, so nothing touches the phone's
 * audio while the ringtone plays).
 */
export async function warmUp(channel, { engine: start = true } = {}) {
  const pass = await passFor(channel);
  passes.set(channel, { pass, at: passes.get(channel)?.at ?? Date.now() });
  if (start) setup(pass.appId);
  return true;
}

/** Forgets a token fetched ahead for a call that won't happen. */
export function forget(channel) {
  passes.delete(channel);
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
    const [pass, perm] = await Promise.all([passFor(channel), permissions()]);
    passes.delete(channel);
    console.log('[call] token ok', { channel, uid: pass.uid, appId: pass.appId, camera: perm.camera, mic: perm.mic });
    if (session !== s) return false;
    Object.assign(s, { token: pass.token, uid: pass.uid, camera: perm.camera, mic: perm.mic });
    setup(pass.appId);
    setBeauty(beauty);
    // Small and fast while it rings; join success steps it up to HD.
    engine.setVideoEncoderConfiguration(PREVIEW);
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
export async function join(channel, opts, attempt = 0) {
  const { beauty, controls, onEvent } = opts;
  // A failure on the first try starts again from nothing (no engine, no
  // channel, a new token); the second is shown on the call screen.
  const fail = (error) => {
    if (attempt === 0) {
      console.log('[call] retrying from scratch', { channel, error });
      reset();
      return join(channel, opts, 1);
    }
    reset();
    onEvent({ status: 'failed', error });
    return undefined;
  };
  onEvent({ status: 'connecting' });
  let ok;
  try {
    ok = await prepare(channel, beauty);
  } catch (err) {
    console.error('[call] token failed', channel, err?.message ?? err);
    if (session?.channel === channel) return fail(err.message);
    return undefined;
  }
  const s = session;
  if (!ok || s?.channel !== channel || s.joined) return undefined;
  s.handler = {
    onJoinChannelSuccess: (conn) => {
      console.log('[call] joined', { channel: conn?.channelId, uid: conn?.localUid });
      if (session !== s) return;
      clearTimeout(s.timer);
      s.live = true;
      engine.setVideoEncoderConfiguration(ENCODER);
      // One small, reliable data stream for call messages (Privacy Mode).
      s.streamId = engine.createDataStream({ syncWithAudio: false, ordered: true });
      if (s.privacy) sendPrivacy(s);
      // Android only routes to the speaker once the channel is joined; set before that, it's ignored.
      const code = engine.setEnableSpeakerphone(s.speaker !== false);
      console.log('[call] speakerphone', { on: s.speaker !== false, code });
      onEvent({ status: 'connected' });
    },
    onUserJoined: (_c, remoteUid) => {
      console.log('[call] other person joined', { channel, remoteUid });
      onEvent({ remoteUid });
      // Whoever joins second still hears that Privacy Mode is on.
      if (s.privacy) sendPrivacy(s);
    },
    onUserOffline: (_c, remoteUid) => onEvent({ remoteUid: null, remoteVideo: false, remotePrivacy: false, gone: remoteUid }),
    onStreamMessage: (_c, remoteUid, _id, data) => {
      const msg = decodeMessage(data);
      if (msg?.type === 'privacy') onEvent({ remotePrivacy: !!msg.active });
    },
    onRemoteVideoStateChanged: (_c, remoteUid, state) =>
      onEvent({ remoteUid, remoteVideo: state !== REMOTE_STOPPED && state !== REMOTE_FAILED }),
    onConnectionStateChanged: (_c, state, reason) => {
      console.log('[call] connection state', { state, reason });
      if (state === CONNECTION_RECONNECTING) onEvent({ status: 'reconnecting' });
      else if (state === CONNECTION_FAILED && session === s) {
        if (s.live) {
          reset();
          onEvent({ status: 'failed', error: `connection ${reason}` });
        } else fail(`connection ${reason}`);
      }
      else if (state === CONNECTION_CONNECTED) onEvent({ status: 'connected' });
    },
    // Sound: what each side's audio is doing, and where it's playing.
    onLocalAudioStateChanged: (_c, state, reason) => console.log('[call] local audio', { state, reason }),
    onRemoteAudioStateChanged: (_c, remoteUid, state, reason) => console.log('[call] remote audio', { remoteUid, state, reason }),
    onAudioRoutingChanged: (routing) => console.log('[call] audio route', { routing }),
    onError: (code, msg) => console.error('Agora Error:', { code, msg }),
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
  // The token was signed for exactly this channel and uid (supabase/functions/agora-token).
  console.log('[call] joining', { channel, uid: s.uid });
  const code = engine.joinChannel(s.token, channel, s.uid, {
    channelProfile: CHANNEL_COMMUNICATION,
    clientRoleType: ROLE_BROADCASTER,
    publishCameraTrack: s.camera,
    publishMicrophoneTrack: s.mic,
    autoSubscribeAudio: true,
    autoSubscribeVideo: true,
  });
  if (code < 0) {
    console.error('[call] joinChannel refused', { channel, uid: s.uid, code });
    // Say so on the call screen, with Agora's code, instead of a black screen.
    return fail(`Agora error ${-code}`);
  }
  s.joined = true;
  // Never left hanging on "Connecting": no join in time is a failure too.
  s.timer = setTimeout(() => {
    if (session === s && !s.live) fail('timed out');
  }, JOIN_TIMEOUT_MS);
  s.speaker = controls?.speaker !== false;
  setMuted(!!controls?.muted);
  setCameraOff(!!controls?.cameraOff);
  s.privacy = !!controls?.privacy;
  return undefined;
}

function sendPrivacy(s) {
  if (s.streamId == null || s.streamId < 0) return;
  const bytes = encodePrivacy(s.privacy);
  const code = engine.sendStreamMessage(s.streamId, bytes, bytes.length);
  if (code < 0) console.error('[call] privacy message not sent', { code });
}

/** Privacy Mode: tells the other person, now if the call is live, or once it is. */
export function setPrivacy(on) {
  if (!session) return;
  session.privacy = on;
  if (session.live) sendPrivacy(session);
}

/** Leaves the call and lets go of the camera and microphone. */
export function leave() {
  const s = session;
  session = null;
  if (!s) return;
  clearTimeout(s.timer);
  if (!engine) return;
  if (s.handler) engine.unregisterEventHandler(s.handler);
  engine.stopPreview();
  if (s.joined) engine.leaveChannel();
}

/**
 * After a failure: leaves the channel and destroys the engine, so the next
 * attempt starts fresh, with a new engine and a new token.
 */
export function reset() {
  const channel = session?.channel;
  leave();
  if (channel) passes.delete(channel);
  if (!engine) return;
  engine.release();
  engine = null;
  engineAppId = null;
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

/** Front to back camera and back again. */
export function switchCamera() {
  if (!engine || !session?.camera) return;
  engine.switchCamera();
}

/** Remembered until the join succeeds, then applied (see onJoinChannelSuccess). */
export function setSpeaker(on) {
  if (!session) return;
  session.speaker = on;
  if (session.live) engine?.setEnableSpeakerphone(on);
}

// On Android your picture is a TextureView: unlike a SurfaceView it is
// clipped by rounded corners and follows the window as you drag it.
const SelfView = Platform.OS === 'android' ? RtcTextureView : RtcSurfaceView;

/** You, from your camera. */
export function LocalVideo({ style }) {
  return <SelfView canvas={{ uid: 0, renderMode: RENDER_HIDDEN }} zOrderMediaOverlay style={style} testID="call-local-video" />;
}

/** The other person. */
export function RemoteVideo({ uid, style }) {
  return <RtcSurfaceView canvas={{ uid, renderMode: RENDER_HIDDEN }} style={style} testID="call-remote-video" />;
}
