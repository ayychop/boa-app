import fs from 'fs';
import path from 'path';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.useFakeTimers();

let mockHub;
jest.mock('../src/context/HubContext', () => ({ useHub: () => mockHub }));
jest.mock('../src/api/hub', () => ({
  ...jest.requireActual('../src/api/hub'),
  getPremiumAccess: jest.fn(),
  amIAdmin: jest.fn(async () => false),
}));
let mockSignal = null;
jest.mock('../src/calls/signaling', () => ({
  listen: jest.fn((me, fn) => {
    mockSignal = fn;
    return () => {
      mockSignal = null;
    };
  }),
  send: jest.fn(async () => true),
  pushRing: jest.fn(async () => true),
}));
// Call links (the call notification's tap, full-screen intent and Answer).
let mockLink = null;
jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(async () => null),
  addEventListener: jest.fn((type, fn) => {
    mockLink = fn;
    return { remove: () => (mockLink = null) };
  }),
}));
// Our backend's answer: the Agora App ID, a token and this person's uid.
jest.mock('../src/calls/token', () => ({ fetchToken: jest.fn(async () => ({ appId: 'boa-app-id', token: 'tok-1', uid: 4242 })) }));

const hub = require('../src/api/hub');
const signal = require('../src/calls/signaling');
const { fetchToken } = require('../src/calls/token');
const { __engine: engine, createAgoraRtcEngine } = require('react-native-agora');
const { PremiumProvider } = require('../src/context/PremiumContext');
const { CallProvider, useCall } = require('../src/context/CallContext');
const { ENCODER, CAPTURE, DENOISER, LOW_LIGHT, HD, PREVIEW, STABILIZATION_OFF, AUDIO, AUDIO_PROCESSING, VIDEO_SCENARIO } = require('../src/calls/quality');
const { createAudioPlayer } = require('expo-audio');
const { ringtoneById } = require('../src/calls/ringtone');

const ME = { id: 'user-me', username: 'ama', display_name: 'Ama Mensah', avatar_url: null };
const KOFI = { id: 'user-kofi', username: 'kofi', display_name: 'Kofi Boateng', avatar_url: null };

beforeEach(() => {
  mockHub = { userId: 'user-me', profile: ME, isAdmin: false, blocked: new Set(), block: jest.fn(async () => {}) };
  hub.getPremiumAccess.mockResolvedValue({ status: 'trial', hasAccess: true, isAdmin: false, trialEndsAt: new Date(Date.now() + 47 * 3600e3).toISOString() });
});

function Dial() {
  const { startCall } = useCall();
  return <Text onPress={() => startCall(KOFI)}>Call Kofi</Text>;
}
const mount = () =>
  render(
    <PremiumProvider>
      <CallProvider>
        <Dial />
      </CallProvider>
    </PremiumProvider>,
  );
const handler = () => engine.registerEventHandler.mock.calls.at(-1)[0];

describe('HD in any light', () => {
  test('1080p30 once live, quality first, never trading sharpness for frames', () => {
    expect(HD).toEqual({ width: 1920, height: 1080, fps: 30 });
    expect(ENCODER.dimensions).toEqual({ width: 1920, height: 1080 });
    expect(ENCODER.frameRate).toBe(30);
    expect(ENCODER.bitrate).toBe(3150);
    expect(ENCODER.degradationPreference).toBe(0); // MaintainQuality
    expect(ENCODER.advanceOptions.compressionPreference).toBe(1); // PreferQuality
    expect(CAPTURE.cameraDirection).toBe(1); // front
  });

  test('a fast camera while it rings: 360p15, capture follows the encoder, no stabilization', () => {
    expect(PREVIEW.dimensions).toEqual({ width: 640, height: 360 });
    expect(PREVIEW.frameRate).toBe(15);
    expect(CAPTURE.format).toBeUndefined();
    expect(STABILIZATION_OFF).toBe(-1); // CameraStabilizationModeOff
  });

  test('two-person tuning: the 1v1 video scenario, and echo-proof audio on the speaker', () => {
    expect(VIDEO_SCENARIO).toBe(2); // ApplicationScenario1v1
    expect(AUDIO.scenario).toBe(5); // AudioScenarioChatroom
    expect(AUDIO_PROCESSING).toEqual(['{"che.audio.aec.enable":true}', '{"che.audio.ans.enable":true}', '{"che.audio.agc.enable":true}']);
  });

  test('noise reduction and low light step in only when needed, so fine detail is kept, both high quality', () => {
    expect(LOW_LIGHT).toEqual({ mode: 0, level: 0 }); // auto
    expect(DENOISER).toEqual({ mode: 0, level: 0 }); // auto: a clean picture is left alone
  });
});

describe('Agora video calls', () => {
  test('ring, preview, join with our token, see them, mute, camera off, hang up', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    await user.press(screen.getByText('Call Kofi'));
    const { callId } = signal.send.mock.calls.at(-1)[2];
    await act(async () => {});
    // The ring also goes by push, to wake their phone if the app is asleep.
    expect(signal.pushRing).toHaveBeenCalledWith(signal.send.mock.calls.at(-1)[0], callId);

    // While it rings: the token is fetched for this call and your camera comes on, set up for HD and low light.
    expect(fetchToken).toHaveBeenCalledWith(callId);
    expect(createAgoraRtcEngine).toHaveBeenCalled();
    expect(engine.initialize).toHaveBeenCalledWith(expect.objectContaining({ appId: 'boa-app-id' }));
    expect(engine.enableVideo).toHaveBeenCalled();
    // Small and fast while it rings, before the camera starts.
    expect(engine.setVideoEncoderConfiguration).toHaveBeenLastCalledWith(PREVIEW);
    expect(engine.setVideoEncoderConfiguration.mock.invocationCallOrder.at(-1)).toBeLessThan(engine.startPreview.mock.invocationCallOrder.at(-1));
    expect(engine.setCameraCapturerConfiguration).toHaveBeenCalledWith(CAPTURE);
    expect(engine.setCameraStabilizationMode).toHaveBeenCalledWith(-1);
    expect(engine.setVideoDenoiserOptions).toHaveBeenCalledWith(true, DENOISER);
    expect(engine.setLowlightEnhanceOptions).toHaveBeenCalledWith(true, LOW_LIGHT);
    // Agora's rule: denoising before high-quality low light.
    expect(engine.setVideoDenoiserOptions.mock.invocationCallOrder[0]).toBeLessThan(engine.setLowlightEnhanceOptions.mock.invocationCallOrder[0]);
    expect(engine.setCameraAutoExposureFaceModeEnabled).toHaveBeenCalledWith(true);
    // The filters' extension is switched on before any filter, then Natural is applied to the camera (source 2).
    expect(engine.enableExtension).toHaveBeenCalledWith('agora_video_filters_clear_vision', 'clear_vision', true, 2);
    expect(engine.enableExtension.mock.invocationCallOrder[0]).toBeLessThan(engine.setBeautyEffectOptions.mock.invocationCallOrder[0]);
    expect(engine.setBeautyEffectOptions).toHaveBeenCalledWith(true, expect.objectContaining({ lighteningContrastLevel: 1, lighteningLevel: 0.2, smoothnessLevel: 0.15, sharpnessLevel: 0.28 }), 2);
    expect(engine.setColorEnhanceOptions).toHaveBeenCalledWith(true, expect.objectContaining({ skinProtectLevel: 1 }), 2);
    expect(engine.setFilterEffectOptions).toHaveBeenCalledWith(false, expect.anything(), 2);
    // Echo cancellation, noise suppression and gain control; one stream; 1v1 tuning.
    for (const p of AUDIO_PROCESSING) expect(engine.setParameters).toHaveBeenCalledWith(p);
    expect(engine.setAINSMode).toHaveBeenCalledWith(true, 0);
    expect(engine.setVideoScenario).toHaveBeenCalledWith(2);
    expect(engine.enableDualStreamMode).toHaveBeenCalledWith(false);
    expect(engine.startPreview).toHaveBeenCalled();
    expect(engine.joinChannel).not.toHaveBeenCalled();
    expect(screen.getByTestId('call-local-video')).toBeOnTheScreen();

    // They answer: join the call's channel, with the sound processing already on.
    await act(async () => mockSignal('accept', { callId }));
    expect(engine.setParameters.mock.invocationCallOrder[0]).toBeLessThan(engine.joinChannel.mock.invocationCallOrder.at(-1));
    expect(engine.joinChannel).toHaveBeenCalledWith('tok-1', callId, 4242, expect.objectContaining({ publishCameraTrack: true, publishMicrophoneTrack: true }));
    expect(screen.getByTestId('call-video-note')).toHaveTextContent('Connecting HD video');
    engine.setEnableSpeakerphone.mockClear();
    await act(async () => handler().onJoinChannelSuccess({}, 10));
    // Joined: HD for the real stream, and the speaker forced on now that Android will take it.
    expect(engine.setVideoEncoderConfiguration).toHaveBeenLastCalledWith(ENCODER);
    expect(engine.setEnableSpeakerphone).toHaveBeenCalledWith(true);
    expect(screen.getByTestId('call-video-note')).toHaveTextContent('Waiting for their video');

    // Their picture fills the screen.
    await act(async () => {
      handler().onUserJoined({}, 777, 0);
      handler().onRemoteVideoStateChanged({}, 777, 2, 0, 0);
    });
    expect(screen.getByTestId('call-remote-video').props.canvas).toEqual(expect.objectContaining({ uid: 777 }));
    expect(screen.getByTestId('call-name')).toHaveTextContent('Kofi Boateng');
    expect(screen.queryByTestId('call-video-note')).toBeNull();

    // Mute and camera off reach the real tracks.
    await user.press(screen.getByTestId('call-mute'));
    expect(engine.muteLocalAudioStream).toHaveBeenLastCalledWith(true);
    await user.press(screen.getByTestId('call-camera'));
    expect(engine.enableLocalVideo).toHaveBeenLastCalledWith(false);
    expect(engine.muteLocalVideoStream).toHaveBeenLastCalledWith(true);
    expect(screen.queryByTestId('call-local-video')).toBeNull();
    await user.press(screen.getByTestId('call-camera'));
    expect(engine.enableLocalVideo).toHaveBeenLastCalledWith(true);
    expect(engine.updateChannelMediaOptions).toHaveBeenLastCalledWith({ publishCameraTrack: true });
    await user.press(screen.getByTestId('call-mute'));
    expect(engine.muteLocalAudioStream).toHaveBeenLastCalledWith(false);
    await user.press(screen.getByTestId('call-speaker'));
    expect(engine.setEnableSpeakerphone).toHaveBeenLastCalledWith(false);

    // Flip to the back camera and back, with a tap you can feel.
    const tap = jest.spyOn(require('../src/utils/haptics').haptics, 'tap');
    await user.press(screen.getByTestId('call-flip'));
    expect(engine.switchCamera).toHaveBeenCalledTimes(1);
    expect(tap).toHaveBeenCalledTimes(1);
    tap.mockRestore();
    expect(screen.getByTestId('call-controls')).toBeOnTheScreen();
    expect(screen.getByTestId('call-self-view')).toBeOnTheScreen();

    // Walking about: the controls tuck away (and can't be pressed), one button brings them back, so does a tap on the picture.
    await user.press(screen.getByTestId('call-hide-controls'));
    expect(screen.getByTestId('call-controls').props.pointerEvents).toBe('none');
    expect(screen.getByTestId('call-show-controls')).toBeOnTheScreen();
    await user.press(screen.getByTestId('call-show-controls'));
    expect(screen.getByTestId('call-controls').props.pointerEvents).toBe('auto');
    expect(screen.queryByTestId('call-show-controls')).toBeNull();
    await user.press(screen.getByTestId('call-picture'));
    expect(screen.getByTestId('call-show-controls')).toBeOnTheScreen();
    await user.press(screen.getByTestId('call-picture'));
    expect(screen.queryByTestId('call-show-controls')).toBeNull();

    // Filters off reach the camera too.
    await user.press(screen.getByTestId('call-filters-button'));
    await user.press(screen.getByTestId('call-filters-toggle'));
    expect(engine.setBeautyEffectOptions).toHaveBeenLastCalledWith(false, expect.anything(), 2);

    // They hang up while the picture's frozen; then the call ends and the camera is let go.
    await user.press(screen.getByTestId('call-end'));
    expect(engine.leaveChannel).toHaveBeenCalled();
    expect(engine.stopPreview).toHaveBeenCalled();
    expect(engine.unregisterEventHandler).toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(2000));
    expect(screen.queryByTestId('call-screen')).toBeNull();
  });

  test('Brightness moves the camera exposure smoothly; hide yourself; flip un-mirrors your preview; the look survives the camera reopening', async () => {
    const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default ?? jest.requireMock('@react-native-async-storage/async-storage');
    // Filters on, Brightness on Auto (an earlier test switched filters off and it's saved).
    await AsyncStorage.removeItem('boa.call.beauty');
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    await user.press(screen.getByText('Call Kofi'));
    const { callId } = signal.send.mock.calls.at(-1)[2];
    await act(async () => {});
    // The ringing preview: your camera at Auto exposure, mirrored like a mirror.
    expect(engine.setCameraExposureFactor).toHaveBeenLastCalledWith(0);
    expect(screen.getByTestId('call-local-video').props.canvas.mirrorMode).toBe(1);
    await act(async () => mockSignal('accept', { callId }));
    engine.setBeautyEffectOptions.mockClear();
    await act(async () => handler().onJoinChannelSuccess({}, 10));
    // Stepping up to HD reopens the camera: the look goes back on.
    expect(engine.setBeautyEffectOptions).toHaveBeenCalled();
    engine.setBeautyEffectOptions.mockClear();
    await act(async () => handler().onLocalVideoStateChanged(2, 1, 0));
    expect(engine.setBeautyEffectOptions).toHaveBeenCalled();

    // The slider: exposure straight to the camera as it moves, saved only when let go.
    await user.press(screen.getByTestId('call-filters-button'));
    const slider = screen.getByTestId('call-brightness');
    expect(slider.props.step).toBe(0);
    // setItem is already a mock: read its calls from here on (never restore it, that wipes it for later tests).
    const from = AsyncStorage.setItem.mock.calls.length;
    const saves = () => AsyncStorage.setItem.mock.calls.slice(from).filter(([k, v]) => k === 'boa.call.beauty' && JSON.parse(v).brightness !== 0.5);
    await act(async () => slider.props.onValueChange(1));
    // The platform's whole range: up to +20 on Android, +8 on iOS.
    const { exposureOf } = require('../src/calls/beauty');
    const os = require('react-native').Platform.OS === 'ios' ? 'ios' : 'android';
    expect(engine.setCameraExposureFactor).toHaveBeenLastCalledWith(exposureOf(1, os));
    expect(Math.abs(exposureOf(1, os))).toBeGreaterThanOrEqual(5);
    expect(screen.getByTestId('call-brightness-value')).toHaveTextContent('+100');
    expect(saves()).toHaveLength(0);
    await act(async () => slider.props.onSlidingComplete(0.75));
    expect(engine.setCameraExposureFactor).toHaveBeenLastCalledWith(exposureOf(0.75, os));
    expect(JSON.parse(saves().at(-1)[1])).toEqual(expect.objectContaining({ brightness: 0.75, v: 2 }));
    await user.press(screen.getByTestId('call-brightness-auto'));
    expect(engine.setCameraExposureFactor).toHaveBeenLastCalledWith(0);

    // Contrast, right beside it: the tone curve reaches the camera as a LUT while it moves, saved when let go.
    const contrast = screen.getByTestId('call-contrast');
    expect(screen.getByTestId('call-contrast-value')).toHaveTextContent('Normal');
    await act(async () => contrast.props.onValueChange(1));
    expect(screen.getByTestId('call-contrast-value')).toHaveTextContent('+100');
    await act(async () => jest.advanceTimersByTime(120));
    expect(engine.setFilterEffectOptions).toHaveBeenLastCalledWith(true, expect.objectContaining({ path: expect.stringMatching(/-b0-c10-/), strength: 1 }), 2);
    await act(async () => contrast.props.onSlidingComplete(0.25));
    expect(JSON.parse(AsyncStorage.setItem.mock.calls.filter(([k]) => k === 'boa.call.beauty').at(-1)[1])).toEqual(expect.objectContaining({ contrast: 0.25 }));
    await user.press(screen.getByTestId('call-contrast-auto'));
    expect(screen.getByTestId('call-contrast-value')).toHaveTextContent('Normal');
    await user.press(screen.getByRole('button', { name: 'Close filters' }));

    // One tap on the strip changes the look.
    await user.press(screen.getByTestId('call-strip-golden'));
    expect(engine.setFilterEffectOptions).toHaveBeenLastCalledWith(true, expect.objectContaining({ strength: 0.75 }), 2);

    // The back camera isn't mirrored; the front one is again after flipping back.
    await user.press(screen.getByTestId('call-flip'));
    expect(screen.getByTestId('call-local-video').props.canvas.mirrorMode).toBe(2);
    await user.press(screen.getByTestId('call-flip'));
    expect(screen.getByTestId('call-local-video').props.canvas.mirrorMode).toBe(1);

    // Hide yourself: you're still sent (nothing stops the camera), just not shown to you.
    const enables = engine.enableLocalVideo.mock.calls.length;
    await user.press(screen.getByTestId('call-self-hide'));
    expect(screen.queryByTestId('call-self-view')).toBeNull();
    expect(screen.queryByTestId('call-local-video')).toBeNull();
    expect(engine.enableLocalVideo.mock.calls.length).toBe(enables);
    expect(engine.muteLocalVideoStream).not.toHaveBeenLastCalledWith(true);
    await user.press(screen.getByTestId('call-self-show'));
    expect(screen.getByTestId('call-self-view')).toBeOnTheScreen();

    await user.press(screen.getByTestId('call-end'));
    await act(async () => jest.advanceTimersByTime(2000));
  });

  test('picture in picture: the call shrinks to a floating window, the call goes on, a tap brings it back, End ends it', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    await user.press(screen.getByText('Call Kofi'));
    const { callId } = signal.send.mock.calls.at(-1)[2];
    await act(async () => {});
    await act(async () => mockSignal('accept', { callId }));
    await act(async () => handler().onJoinChannelSuccess({}, 10));
    await act(async () => {
      handler().onUserJoined({}, 777, 0);
      handler().onRemoteVideoStateChanged({}, 777, 2, 0, 0);
    });
    const leaves = engine.leaveChannel.mock.calls.length;

    await user.press(screen.getByTestId('call-minimize'));
    // The full screen goes; the app is usable under a floating window with their picture in it.
    expect(screen.queryByTestId('call-screen')).toBeNull();
    expect(screen.getByTestId('call-mini')).toBeOnTheScreen();
    expect(screen.getByTestId('call-mini-layer').props.pointerEvents).toBe('box-none');
    expect(screen.getByTestId('call-remote-video').props.canvas).toEqual(expect.objectContaining({ uid: 777 }));
    expect(screen.getByText('Call Kofi')).toBeOnTheScreen();
    // Nothing about the call changed.
    expect(engine.leaveChannel.mock.calls.length).toBe(leaves);

    await user.press(screen.getByRole('button', { name: 'Back to your call with Kofi Boateng' }));
    expect(screen.getByTestId('call-screen')).toBeOnTheScreen();
    expect(screen.queryByTestId('call-mini')).toBeNull();

    await user.press(screen.getByTestId('call-minimize'));
    await user.press(screen.getByTestId('call-mini-end'));
    expect(engine.leaveChannel.mock.calls.length).toBe(leaves + 1);
    await act(async () => jest.advanceTimersByTime(2000));
    expect(screen.queryByTestId('call-mini')).toBeNull();
  });

  test('system picture in picture: ready while you are on a call, their picture alone in the window, off when it ends', async () => {
    const BoaCall = require('../modules/boa-call');
    BoaCall.setPipReady.mockClear();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    await user.press(screen.getByText('Call Kofi'));
    const { callId } = signal.send.mock.calls.at(-1)[2];
    await act(async () => {});
    // Ringing out counts: leave the app and it floats.
    expect(BoaCall.setPipReady).toHaveBeenLastCalledWith(true);
    await act(async () => mockSignal('accept', { callId }));
    await act(async () => handler().onJoinChannelSuccess({}, 10));
    await act(async () => {
      handler().onUserJoined({}, 777, 0);
      handler().onRemoteVideoStateChanged({}, 777, 2, 0, 0);
    });
    // Android puts it in the window: their picture, edge to edge, no controls, no Modal.
    await act(async () => BoaCall.__pip(true));
    expect(screen.getByTestId('call-pip')).toBeOnTheScreen();
    expect(screen.queryByTestId('call-screen')).toBeNull();
    expect(screen.queryByTestId('call-controls')).toBeNull();
    expect(screen.getByTestId('call-remote-video').props.canvas).toEqual(expect.objectContaining({ uid: 777 }));
    // Tapped back to full screen.
    await act(async () => BoaCall.__pip(false));
    expect(screen.getByTestId('call-screen')).toBeOnTheScreen();
    await user.press(screen.getByTestId('call-end'));
    expect(BoaCall.setPipReady).toHaveBeenLastCalledWith(false);
    await act(async () => jest.advanceTimersByTime(2000));
  });

  test('the app manifest allows picture in picture, and the activity never restarts going in or out', () => {
    const plugins = require('../app.json').expo.plugins;
    expect(plugins).toContain('./plugins/withCallPictureInPicture');
    const activity = { $: { 'android:name': '.MainActivity' } };
    let mod;
    jest.isolateModules(() => {
      jest.doMock('expo/config-plugins', () => ({
        AndroidConfig: { Manifest: { getMainActivityOrThrow: () => activity } },
        withAndroidManifest: (config, fn) => ((mod = fn), config),
      }));
      require('../plugins/withCallPictureInPicture')({});
    });
    mod({ modResults: {} });
    expect(activity.$['android:supportsPictureInPicture']).toBe('true');
    const changes = plugins.find((p) => Array.isArray(p) && p[0] === './plugins/withAndroidConfigChanges')[1].configChanges;
    expect(changes).toEqual(expect.arrayContaining(['screenSize', 'smallestScreenSize', 'screenLayout', 'orientation']));
  });

  test('an answered incoming call joins; a token that fails twice says so instead of hanging', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    fetchToken.mockClear();
    fetchToken.mockRejectedValue(new Error('Video calls are not set up yet.'));
    engine.joinChannel.mockClear();
    engine.release.mockClear();
    await mount();
    await act(async () => mockSignal('ring', { callId: 'a7c3e1f0-0000-4000-8000-000000000001', from: { id: 'user-kofi', name: 'Kofi Boateng' } }));
    await user.press(screen.getByTestId('call-accept'));
    await act(async () => {});
    expect(engine.joinChannel).not.toHaveBeenCalled();
    expect(screen.getByTestId('call-video-note')).toHaveTextContent("Video couldn't connect: Video calls are not set up yet.");
    // Fetched while it rang, on answer, and once more from scratch, then the engine is let go.
    expect(fetchToken).toHaveBeenCalledTimes(3);
    expect(engine.release).toHaveBeenCalled();
    fetchToken.mockResolvedValue({ appId: 'boa-app-id', token: 'tok-1', uid: 4242 });
    await user.press(screen.getByTestId('call-end'));
    await act(async () => jest.advanceTimersByTime(2000));

    // Next call works.
    await act(async () => mockSignal('ring', { callId: 'a7c3e1f0-0000-4000-8000-000000000002', from: { id: 'user-kofi', name: 'Kofi Boateng' } }));
    await user.press(screen.getByTestId('call-accept'));
    await act(async () => {});
    expect(engine.joinChannel).toHaveBeenCalledWith('tok-1', 'a7c3e1f0-0000-4000-8000-000000000002', 4242, expect.anything());
  });
});

describe('Privacy Mode', () => {
  const ScreenCapture = require('expo-screen-capture');
  const { decodeMessage, encodePrivacy } = require('../src/calls/privacy');

  test('the message is tiny JSON both ways, and anything else is ignored', () => {
    expect(decodeMessage(encodePrivacy(true))).toEqual({ type: 'privacy', active: true });
    expect(decodeMessage(Uint8Array.from('not json', (c) => c.charCodeAt(0)))).toBeNull();
  });

  test('blocks screenshots, tells them over the data stream, shows both sides, and resets for the next call', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    ScreenCapture.preventScreenCaptureAsync.mockClear();
    ScreenCapture.allowScreenCaptureAsync.mockClear();
    await mount();
    await act(async () => mockSignal('ring', { callId: 'd1c3e1f0-0000-4000-8000-000000000001', from: { id: 'user-kofi', name: 'Kofi Boateng' } }));
    await user.press(screen.getByTestId('call-accept'));
    await act(async () => {});
    engine.sendStreamMessage.mockClear();
    await act(async () => handler().onJoinChannelSuccess({}, 10));
    expect(engine.createDataStream).toHaveBeenCalledWith({ syncWithAudio: false, ordered: true });
    expect(engine.sendStreamMessage).not.toHaveBeenCalled();

    // On: screenshots blocked here, a gold shield on your picture, and they're told.
    await user.press(screen.getByTestId('call-privacy'));
    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('call-privacy-on')).toBeOnTheScreen();
    expect(screen.getByLabelText('Privacy Mode on')).toBeOnTheScreen();
    const [streamId, bytes, length] = engine.sendStreamMessage.mock.calls.at(-1);
    expect(streamId).toBe(0);
    expect(length).toBe(bytes.length);
    expect(decodeMessage(bytes)).toEqual({ type: 'privacy', active: true });

    // Someone joining after still hears it.
    await act(async () => handler().onUserJoined({}, 777, 0));
    expect(decodeMessage(engine.sendStreamMessage.mock.calls.at(-1)[1])).toEqual({ type: 'privacy', active: true });

    // Off again.
    await user.press(screen.getByTestId('call-privacy'));
    expect(ScreenCapture.allowScreenCaptureAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('call-privacy-on')).toBeNull();
    expect(decodeMessage(engine.sendStreamMessage.mock.calls.at(-1)[1])).toEqual({ type: 'privacy', active: false });

    // They turn theirs on: the pill says so, and goes when they turn it off.
    await act(async () => handler().onStreamMessage({}, 777, 1, encodePrivacy(true), 30, 0));
    expect(screen.getByTestId('call-remote-privacy')).toHaveTextContent('🔒 Kofi Boateng has disabled screenshots.');
    await act(async () => handler().onStreamMessage({}, 777, 1, encodePrivacy(false), 31, 0));
    expect(screen.queryByTestId('call-remote-privacy')).toBeNull();

    // On at hang up: screenshots come straight back, and the next call starts with everyone's off.
    await act(async () => handler().onStreamMessage({}, 777, 1, encodePrivacy(true), 30, 0));
    await user.press(screen.getByTestId('call-privacy'));
    await user.press(screen.getByTestId('call-end'));
    expect(ScreenCapture.allowScreenCaptureAsync).toHaveBeenCalledTimes(2);
    await act(async () => jest.advanceTimersByTime(2000));
    await act(async () => mockSignal('ring', { callId: 'd1c3e1f0-0000-4000-8000-000000000002', from: { id: 'user-kofi', name: 'Kofi Boateng' } }));
    await user.press(screen.getByTestId('call-accept'));
    await act(async () => {});
    await act(async () => handler().onJoinChannelSuccess({}, 10));
    expect(screen.queryByTestId('call-remote-privacy')).toBeNull();
    expect(screen.queryByTestId('call-privacy-on')).toBeNull();
    expect(screen.getByLabelText('Privacy Mode off')).toBeOnTheScreen();
    await user.press(screen.getByTestId('call-end'));
    await act(async () => jest.advanceTimersByTime(2000));
  });
});

describe('the ringtone', () => {
  test('rings out loud and loops while an incoming call rings; answering stops it', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    createAudioPlayer.mockClear();
    await act(async () => mockSignal('ring', { callId: 'c1c3e1f0-0000-4000-8000-000000000001', from: { id: 'user-kofi', name: 'Kofi Boateng' } }));
    const tone = createAudioPlayer.mock.results.at(-1).value;
    expect(createAudioPlayer).toHaveBeenCalledWith(ringtoneById('hiphop').asset);
    expect(tone.loop).toBe(true);
    expect(tone.play).toHaveBeenCalled();
    await user.press(screen.getByTestId('call-accept'));
    expect(tone.pause).toHaveBeenCalled();
    expect(tone.removed).toBe(true);
    await user.press(screen.getByTestId('call-end'));
    await act(async () => jest.advanceTimersByTime(2000));
  });

  test('plays the ringtone you chose (Bashment here), and answering stops it', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockHub = { ...mockHub, ringtone: 'bashment' };
    await mount();
    createAudioPlayer.mockClear();
    await act(async () => mockSignal('ring', { callId: 'c1c3e1f0-0000-4000-8000-000000000009', from: { id: 'user-kofi', name: 'Kofi Boateng' } }));
    const tone = createAudioPlayer.mock.results.at(-1).value;
    expect(createAudioPlayer).toHaveBeenCalledWith(ringtoneById('bashment').asset);
    expect(tone.loop).toBe(true);
    await user.press(screen.getByTestId('call-accept'));
    expect(tone.removed).toBe(true);
    await user.press(screen.getByTestId('call-end'));
    await act(async () => jest.advanceTimersByTime(2000));
  });

  test('declining or missing a call stops it too', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    await act(async () => mockSignal('ring', { callId: 'c1c3e1f0-0000-4000-8000-000000000002', from: { id: 'user-kofi', name: 'Kofi Boateng' } }));
    const declined = createAudioPlayer.mock.results.at(-1).value;
    await user.press(screen.getByTestId('call-decline'));
    expect(declined.removed).toBe(true);
    await act(async () => jest.advanceTimersByTime(2000));

    await act(async () => mockSignal('ring', { callId: 'c1c3e1f0-0000-4000-8000-000000000003', from: { id: 'user-kofi', name: 'Kofi Boateng' } }));
    const missed = createAudioPlayer.mock.results.at(-1).value;
    expect(missed).not.toBe(declined);
    await act(async () => jest.advanceTimersByTime(46000));
    expect(missed.removed).toBe(true);
    await act(async () => jest.advanceTimersByTime(2000));
  });
});

describe('agora-token Edge Function', () => {
  const fn = fs.readFileSync(path.join(__dirname, '../supabase/functions/agora-token/index.ts'), 'utf8');
  test('signs on the server with the certificate, for signed-in, unbanned callers only', () => {
    expect(fn).toMatch(/Deno\.env\.get\('AGORA_APP_CERTIFICATE'\)/);
    expect(fn).toMatch(/auth\.getUser\(\)/);
    expect(fn).toMatch(/banned_at/);
    expect(fn).toMatch(/RtcTokenBuilder\.buildTokenWithUid\(APP_ID, CERTIFICATE, channel, uid, RtcRole\.PUBLISHER/);
  });
  test('every refusal is logged with console.error and returned as JSON; success carries the channel', () => {
    expect(fn).toMatch(/console\.error\('\[agora-token\]'/);
    expect(fn).toMatch(/Couldn't sign the video token/);
    expect(fn).toMatch(/json\(\{ appId: APP_ID, token, uid, channel, expiresIn: TTL \}\)/);
  });
  test('the certificate never appears in the app', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/calls/media.native.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '../src/calls/token.js'), 'utf8');
    expect(src).not.toMatch(/AGORA_APP_CERTIFICATE|appCertificate|buildToken/);
  });
});

describe('Android camera and microphone', () => {
  const { Alert, PermissionsAndroid, Platform } = require('react-native');
  const app = require('../app.json').expo;
  const GRANTED = PermissionsAndroid.RESULTS.GRANTED;

  test('nothing in the config strips the camera: the image picker no longer blocks it', () => {
    const picker = app.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-image-picker');
    expect(picker[1].cameraPermission).toEqual(expect.any(String));
    expect(app.android.blockedPermissions ?? []).not.toContain('android.permission.CAMERA');
    for (const p of ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO', 'android.permission.MODIFY_AUDIO_SETTINGS']) expect(app.android.permissions).toContain(p);
  });

  describe('on an Android phone', () => {
    const os = Platform.OS;
    beforeEach(() => {
      Platform.OS = 'android';
    });
    afterEach(() => {
      Platform.OS = os;
      jest.restoreAllMocks();
    });

    async function answer(callId) {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await mount();
      await act(async () => mockSignal('ring', { callId, from: { id: 'user-kofi', name: 'Kofi Boateng' } }));
      await user.press(screen.getByTestId('call-accept'));
      await act(async () => {});
      return user;
    }

    test('asks for both before the engine starts, then joins with audio and video on', async () => {
      const ask = jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({ 'android.permission.CAMERA': GRANTED, 'android.permission.RECORD_AUDIO': GRANTED });
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      engine.joinChannel.mockClear();
      const user = await answer('b1c3e1f0-0000-4000-8000-000000000001');
      expect(ask).toHaveBeenCalledWith(['android.permission.CAMERA', 'android.permission.RECORD_AUDIO']);
      expect(alert).not.toHaveBeenCalled();
      // The engine is set up once per app session, with sound and picture on before any join.
      expect(engine.enableAudio).toHaveBeenCalled();
      expect(engine.enableAudio.mock.invocationCallOrder[0]).toBeLessThan(engine.joinChannel.mock.invocationCallOrder.at(-1));
      expect(engine.enableVideo.mock.invocationCallOrder[0]).toBeLessThan(engine.joinChannel.mock.invocationCallOrder.at(-1));
      expect(engine.joinChannel).toHaveBeenLastCalledWith('tok-1', 'b1c3e1f0-0000-4000-8000-000000000001', 4242, expect.objectContaining({ publishCameraTrack: true, publishMicrophoneTrack: true }));
      await user.press(screen.getByTestId('call-end'));
      await act(async () => jest.advanceTimersByTime(2000));
    });

    test('a refused camera shows an alert (with Settings if Android stopped asking) and the call goes on with sound', async () => {
      jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({
        'android.permission.CAMERA': PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
        'android.permission.RECORD_AUDIO': GRANTED,
      });
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const user = await answer('b1c3e1f0-0000-4000-8000-000000000002');
      expect(alert).toHaveBeenCalledWith('Allow your camera', expect.stringMatching(/can't see you/), expect.arrayContaining([expect.objectContaining({ text: 'Open Settings' })]));
      expect(engine.joinChannel).toHaveBeenLastCalledWith('tok-1', 'b1c3e1f0-0000-4000-8000-000000000002', 4242, expect.objectContaining({ publishCameraTrack: false, publishMicrophoneTrack: true }));
      await user.press(screen.getByTestId('call-end'));
      await act(async () => jest.advanceTimersByTime(2000));
    });

    test('a refused first join is torn down and retried from scratch, and connects', async () => {
      jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({ 'android.permission.CAMERA': GRANTED, 'android.permission.RECORD_AUDIO': GRANTED });
      engine.joinChannel.mockClear();
      engine.release.mockClear();
      engine.joinChannel.mockReturnValueOnce(-17);
      const user = await answer('b1c3e1f0-0000-4000-8000-000000000004');
      expect(engine.release).toHaveBeenCalledTimes(1);
      expect(engine.joinChannel).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('call-video-note')).toHaveTextContent('Connecting HD video');
      await act(async () => handler().onJoinChannelSuccess({}, 10));
      expect(screen.getByTestId('call-video-note')).toHaveTextContent('Waiting for their video');
      await user.press(screen.getByTestId('call-end'));
      await act(async () => jest.advanceTimersByTime(2000));
    });

    test('if Agora refuses the join twice, the screen says so with the code, not a black screen', async () => {
      jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({ 'android.permission.CAMERA': GRANTED, 'android.permission.RECORD_AUDIO': GRANTED });
      engine.joinChannel.mockReturnValueOnce(-17).mockReturnValueOnce(-17);
      const user = await answer('b1c3e1f0-0000-4000-8000-000000000003');
      expect(screen.getByTestId('call-video-note')).toHaveTextContent("Video couldn't connect: Agora error 17");
      await user.press(screen.getByTestId('call-end'));
      await act(async () => jest.advanceTimersByTime(2000));
    });
  });
});

describe('incoming calls by push', () => {
  const Notifications = require('expo-notifications');
  const push = (data) => ({ request: { identifier: 'n-1', content: { data: { type: 'call', ...data } } } });
  const received = () => Notifications.addNotificationReceivedListener.mock.calls.at(-1)[0];

  test('a call push rings the call screen, once, even when Realtime rings the same call too', async () => {
    signal.send.mockClear();
    await mount();
    const callId = 'b2c3e1f0-0000-4000-8000-000000000001';
    await act(async () => received()(push({ callId, sentAt: Date.now(), from: { id: 'user-kofi', name: 'Kofi Boateng' } })));
    expect(screen.getByTestId('call-accept')).toBeOnTheScreen();
    // The same call arriving over Realtime is the same call, not a second one to turn away.
    await act(async () => mockSignal('ring', { callId, from: { id: 'user-kofi', name: 'Kofi Boateng' } }));
    expect(signal.send).not.toHaveBeenCalledWith('user-kofi', 'busy', expect.anything());
    await user().press(screen.getByTestId('call-decline'));
    await act(async () => jest.advanceTimersByTime(2000));
  });

  test('a push for a call that has already stopped ringing does nothing', async () => {
    await mount();
    await act(async () => received()(push({ callId: 'b2c3e1f0-0000-4000-8000-000000000002', sentAt: Date.now() - 60000, from: { id: 'user-kofi', name: 'Kofi Boateng' } })));
    expect(screen.queryByTestId('call-accept')).toBeNull();
  });

  const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
});

describe('the filter readout', () => {
  test('the preset, then Brightness; "Filters off" when they are off', () => {
    const { describeParts } = require('../src/calls/beauty');
    expect(describeParts({ preset: 'golden', brightness: 0.5, enabled: true })).toEqual([
      { id: 'preset', label: 'Golden', value: null },
      { id: 'brightness', label: 'Bright', value: 'Auto' },
    ]);
    expect(describeParts({ preset: 'golden', brightness: 0.7, enabled: true })[1].value).toBe('+40');
    expect(describeParts({ preset: 'golden', brightness: 0.25, enabled: true })[1].value).toBe('-50');
    expect(describeParts({ preset: 'golden', enabled: false })).toEqual([{ id: 'off', label: 'Filters off', value: null }]);
  });
});

describe('the call presets', () => {
  const { lutText, GRADES, LUT_SIZE } = require('../src/calls/luts');
  const { PRESETS, toAgora } = require('../src/calls/beauty');
  const rows = (id) => lutText(id).trim().split('\n');

  test('six presets; every one but Natural grades the picture with a 32-point Cube LUT', () => {
    expect(PRESETS.map((p) => p.label)).toEqual(['Natural', 'Studio', 'Golden', 'Cinematic', 'Glow', 'B&W']);
    for (const p of PRESETS.filter((x) => x.grade)) {
      const lines = rows(p.grade.lut);
      expect(lines[1]).toBe('LUT_3D_SIZE 32');
      // Header, then one row per cell, red changing fastest.
      expect(lines.length).toBe(4 + LUT_SIZE ** 3);
      for (const v of lines[4].split(' ').concat(lines.at(-1).split(' '))) expect(Number(v)).toBeGreaterThanOrEqual(0);
    }
    expect(PRESETS.find((p) => p.id === 'natural').grade).toBeNull();
  });

  test('B&W is grey everywhere; Golden is warmer than it found; Cinematic pushes shadows teal', () => {
    for (const c of [
      [0.8, 0.2, 0.1],
      [0.1, 0.5, 0.9],
    ]) {
      const [r, g, b] = GRADES.bw(...c);
      expect(r).toBeCloseTo(g, 6);
      expect(g).toBeCloseTo(b, 6);
    }
    const [r, , b] = GRADES.golden(0.5, 0.5, 0.5);
    expect(r).toBeGreaterThan(b);
    const [sr, , sb] = GRADES.cinematic(0.15, 0.15, 0.15);
    expect(sb).toBeGreaterThan(sr);
  });

  test('each preset reaches Agora as beauty, colour and its grade; Brightness is the camera exposure', () => {
    const bw = toAgora({ preset: 'bw', brightness: 1, enabled: true });
    expect(bw.filter).toEqual({ enabled: true, lut: 'bw', strength: 1 });
    expect(bw.colorEnhance.enabled).toBe(false);
    // The preset sets its own light; Brightness doesn't touch the lightening when the camera takes exposure.
    expect(bw.beauty.lighteningLevel).toBe(toAgora({ preset: 'bw', brightness: 0, enabled: true }).beauty.lighteningLevel);
    expect(toAgora({ preset: 'glow', brightness: 0, enabled: true }).beauty.lighteningContrastLevel).toBe(0);
    // Auto in the middle; strong at the ends, Android's range bigger than iOS's.
    expect(toAgora({ preset: 'natural', brightness: 0.5 }).exposure.factor).toBe(0);
    expect(toAgora({ preset: 'natural', brightness: 1 }).exposure.factor).toBe(20);
    expect(toAgora({ preset: 'natural', brightness: 0 }).exposure.factor).toBe(-20);
    expect(toAgora({ preset: 'natural', brightness: 1 }, { os: 'ios' }).exposure.factor).toBe(8);
    // A camera without exposure: Brightness above Auto lifts the lightening instead, still capped.
    const noExposure = toAgora({ preset: 'natural', brightness: 1 }, { exposure: false });
    expect(noExposure.exposure.factor).toBe(0);
    expect(noExposure.beauty.lighteningLevel).toBeGreaterThan(toAgora({ preset: 'natural', brightness: 1 }).beauty.lighteningLevel);
    expect(noExposure.beauty.lighteningLevel).toBeLessThanOrEqual(0.5);
    const off = toAgora({ preset: 'cinematic', brightness: 1, enabled: false });
    expect(off.beauty.enabled).toBe(false);
    expect(off.filter.enabled).toBe(false);
    // Filters off leaves Brightness where you left it.
    expect(off.exposure.factor).toBe(toAgora({ preset: 'cinematic', brightness: 1 }).exposure.factor);
    const offNoExposure = toAgora({ preset: 'cinematic', brightness: 1, enabled: false }, { exposure: false });
    expect(offNoExposure.beauty).toEqual(expect.objectContaining({ enabled: true, smoothnessLevel: 0, lighteningLevel: 0.5 }));
    expect(offNoExposure.filter.enabled).toBe(false);
  });

  test('the outgoing video is never mirrored; your preview is, on the front camera only', () => {
    expect(ENCODER.mirrorMode).toBe(2);
    expect(PREVIEW.mirrorMode).toBe(2);
    const { LocalVideo } = require('../src/calls/media');
    expect(LocalVideo({ mirror: true }).props.canvas.mirrorMode).toBe(1);
    expect(LocalVideo({ mirror: false }).props.canvas.mirrorMode).toBe(2);
  });
});

describe('the first call works first time', () => {
  function Primed() {
    const { primeCall, startCall, callPrep } = useCall();
    return (
      <>
        <Text onPress={primeCall}>Prime</Text>
        <Text onPress={() => startCall(KOFI)}>Call Kofi</Text>
        <Text testID="prep">{callPrep}</Text>
      </>
    );
  }
  const mountPrimed = () =>
    render(
      <PremiumProvider>
        <CallProvider>
          <Primed />
        </CallProvider>
      </PremiumProvider>,
    );

  test('the token and engine are ready before the tap, the call uses them, and a missed call tears the engine down', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    fetchToken.mockClear();
    engine.release.mockClear();
    let answer;
    fetchToken.mockImplementationOnce((channel) => new Promise((r) => (answer = () => r({ appId: 'boa-app-id', token: 'tok-early', uid: 4242, channel }))));
    await mountPrimed();
    await user.press(screen.getByText('Prime'));
    expect(screen.getByTestId('prep')).toHaveTextContent('preparing');
    const early = fetchToken.mock.calls.at(-1)[0];

    // Tapped while it's still getting ready: "starting", and nothing rings yet.
    signal.send.mockClear();
    await user.press(screen.getByText('Call Kofi'));
    expect(screen.getByTestId('prep')).toHaveTextContent('starting');
    expect(signal.send).not.toHaveBeenCalled();
    await act(async () => answer());
    // Ready: the call rings under the id got ready, with the token already in hand.
    const { callId } = signal.send.mock.calls.at(-1)[2];
    expect(callId).toBe(early);
    expect(fetchToken).toHaveBeenCalledTimes(1);
    expect(engine.initialize).toHaveBeenCalledWith(expect.objectContaining({ appId: 'boa-app-id' }));
    await act(async () => mockSignal('accept', { callId }));
    expect(engine.joinChannel).toHaveBeenLastCalledWith('tok-early', early, 4242, expect.anything());
    await user.press(screen.getByTestId('call-end'));
    await act(async () => jest.advanceTimersByTime(2000));

    // Nobody answers: the engine is destroyed so the next call starts fresh.
    await user.press(screen.getByText('Call Kofi'));
    await act(async () => {});
    await act(async () => jest.advanceTimersByTime(46000));
    expect(engine.release).toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(2000));
  });

  test('a join that never connects is retried from scratch, then reported', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { JOIN_TIMEOUT_MS } = require('../src/calls/media');
    await mount();
    await act(async () => mockSignal('ring', { callId: 'e1c3e1f0-0000-4000-8000-000000000001', from: { id: 'user-kofi', name: 'Kofi Boateng' } }));
    await user.press(screen.getByTestId('call-accept'));
    await act(async () => {});
    engine.joinChannel.mockClear();
    engine.release.mockClear();
    await act(async () => jest.advanceTimersByTime(JOIN_TIMEOUT_MS + 10));
    expect(engine.release).toHaveBeenCalledTimes(1);
    expect(engine.joinChannel).toHaveBeenCalledTimes(1);
    await act(async () => jest.advanceTimersByTime(JOIN_TIMEOUT_MS + 10));
    expect(screen.getByTestId('call-video-note')).toHaveTextContent("Video couldn't connect: timed out");
    await user.press(screen.getByTestId('call-end'));
    await act(async () => jest.advanceTimersByTime(2000));
  });
});

describe('ringing like a phone call (the app in the background)', () => {
  const BoaCall = require('../modules/boa-call');
  const { AppState } = require('react-native');
  const { callLink, parseCallLink, callFromPush, ringNotification } = require('../src/calls/incoming');
  const from = { id: 'user-kofi', name: 'Kofi Boateng', avatar_url: null };
  const away = AppState.currentState;
  afterEach(() => {
    AppState.currentState = away;
  });

  test('call links and call pushes read back, however the push arrived', () => {
    const call = { callId: 'f1c3e1f0-0000-4000-8000-000000000001', from, sentAt: 1000 };
    expect(parseCallLink(callLink(call, 'accept'))).toEqual({ ...call, action: 'accept' });
    expect(parseCallLink(callLink(call))).toEqual({ ...call, action: null });
    expect(parseCallLink('network.boa://u/kofi')).toBeNull();
    const data = { type: 'call', callId: call.callId, sentAt: 1000, ringtone: 'rnb', from };
    const read = { ...call, ringtone: 'rnb' };
    expect(callFromPush({ dataString: JSON.stringify(data) })).toEqual(read);
    expect(callFromPush({ body: JSON.stringify(data) })).toEqual(read);
    expect(callFromPush({ ...data, from: JSON.stringify(from) })).toEqual(read);
    expect(callFromPush({ type: 'chat' })).toBeNull();
  });

  test('a ring with the app in the background rings the call notification, not the in-app ringtone', async () => {
    AppState.currentState = 'background';
    await mount();
    createAudioPlayer.mockClear();
    BoaCall.showIncoming.mockClear();
    const callId = 'f1c3e1f0-0000-4000-8000-000000000002';
    await act(async () => mockSignal('ring', { callId, from }));
    expect(BoaCall.showIncoming).toHaveBeenCalledWith(
      expect.objectContaining({
        callId,
        name: 'Kofi Boateng',
        channelId: 'boa-call-hiphop',
        link: expect.stringMatching(/^network\.boa:\/\/call\//),
        acceptLink: expect.stringContaining('action=accept'),
      }),
    );
    expect(createAudioPlayer).not.toHaveBeenCalled();
    // Nobody answers: the notification goes when the call is missed.
    BoaCall.cancelIncoming.mockClear();
    await act(async () => jest.advanceTimersByTime(46000));
    expect(BoaCall.cancelIncoming).toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(2000));
    expect(BoaCall.leaveLockScreen).toHaveBeenCalled();
  });

  test('Answer on the notification opens the app on the call and answers it', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    signal.send.mockClear();
    const callId = 'f1c3e1f0-0000-4000-8000-000000000003';
    await act(async () => mockLink({ url: callLink({ callId, from, sentAt: Date.now() }, 'accept') }));
    expect(signal.send).toHaveBeenCalledWith('user-kofi', 'accept', { callId, by: 'user-me' });
    expect(BoaCall.cancelIncoming).toHaveBeenCalled();
    await user.press(screen.getByTestId('call-end'));
    await act(async () => jest.advanceTimersByTime(2000));
  });

  test('a stale call link (the ring is over) rings nothing', async () => {
    await mount();
    signal.send.mockClear();
    await act(async () => mockLink({ url: callLink({ callId: 'f1c3e1f0-0000-4000-8000-000000000004', from, sentAt: Date.now() - 60000 }, 'accept') }));
    expect(signal.send).not.toHaveBeenCalled();
    expect(screen.queryByTestId('call-accept')).toBeNull();
  });

  test('Decline on the notification declines to the caller, even a call that only came by push', async () => {
    await mount();
    signal.send.mockClear();
    const callId = 'f1c3e1f0-0000-4000-8000-000000000005';
    await ringNotification({ callId, from, sentAt: Date.now(), ringtone: 'rnb' });
    expect(BoaCall.showIncoming).toHaveBeenLastCalledWith(expect.objectContaining({ callId, channelId: 'boa-call-rnb' }));
    await act(async () => BoaCall.__decline(callId));
    expect(signal.send).toHaveBeenCalledWith('user-kofi', 'decline', { callId });
  });

  test('the push function rings Android phones data-only (the app rings full screen), iPhones visibly', () => {
    const fn = fs.readFileSync(path.join(__dirname, '../supabase/functions/call-push/index.ts'), 'utf8');
    expect(fn).toMatch(/t\.platform === 'android'\s*\?\s*\{ to: t\.token, priority: 'high', ttl: RING_SECONDS, data \}/);
    expect(fn).toMatch(/ringtone,/);
    const app = require('../app.json').expo;
    expect(app.android.permissions).toContain('android.permission.USE_FULL_SCREEN_INTENT');
  });
});

describe('calls that never leave anyone stuck', () => {
  const { AppState } = require('react-native');
  const { callFromPush, RING_MS } = require('../src/calls/incoming');
  const from = { id: 'user-kofi', name: 'Kofi Boateng', avatar_url: null };
  const ringOut = async (user) => {
    signal.send.mockClear();
    await user.press(screen.getByText('Call Kofi'));
    await act(async () => {});
    return signal.send.mock.calls.find(([, event]) => event === 'ring')[2];
  };

  test("the background task finds the call one level down, in FCM's data", () => {
    const data = { type: 'call', callId: 'a1c3e1f0-0000-4000-8000-000000000001', sentAt: 1000, ringtone: 'rnb', from };
    const task = { notification: null, data: { body: JSON.stringify(data), dataString: JSON.stringify(data), experienceId: '@boa/app' } };
    expect(callFromPush(task)).toEqual({ callId: data.callId, from, sentAt: 1000, ringtone: 'rnb' });
  });

  test('a ring says when it was sent, and one that arrives after the ring is over rings nothing', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    const ring = await ringOut(user);
    expect(ring.sentAt).toEqual(expect.any(Number));
    await user.press(screen.getByTestId('call-end'));
    await act(async () => jest.advanceTimersByTime(2000));
    await act(async () => mockSignal('ring', { callId: 'a1c3e1f0-0000-4000-8000-000000000002', from, sentAt: Date.now() - RING_MS - 1000 }));
    expect(screen.queryByTestId('call-accept')).toBeNull();
  });

  test('ringing them while they ring you connects you both, never "on another call"', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    const mine = await ringOut(user);
    signal.send.mockClear();
    // Their call id sorts first: theirs is the call. Yours is dropped and theirs answered.
    const theirs = '00000000-0000-4000-8000-000000000000';
    await act(async () => mockSignal('ring', { callId: theirs, from, sentAt: Date.now() }));
    expect(signal.send).not.toHaveBeenCalledWith('user-kofi', 'busy', expect.anything());
    expect(signal.send).toHaveBeenCalledWith('user-kofi', 'end', { callId: mine.callId });
    expect(signal.send).toHaveBeenCalledWith('user-kofi', 'accept', { callId: theirs, by: 'user-me' });
    expect(screen.getByTestId('call-end')).toBeOnTheScreen();
    await user.press(screen.getByTestId('call-end'));
    await act(async () => jest.advanceTimersByTime(2000));
  });

  test('when your call sorts first, it rings them again so they answer it', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    const mine = await ringOut(user);
    signal.send.mockClear();
    await act(async () => mockSignal('ring', { callId: 'zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz', from, sentAt: Date.now() }));
    expect(signal.send).not.toHaveBeenCalledWith('user-kofi', 'busy', expect.anything());
    expect(signal.send).toHaveBeenCalledWith('user-kofi', 'ring', expect.objectContaining({ callId: mine.callId }));
    await user.press(screen.getByTestId('call-end'));
    await act(async () => jest.advanceTimersByTime(2000));
  });

  test("a ring that ran out while the app was frozen ends the moment it's back, and you can call again", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const listeners = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
      listeners.push(fn);
      return { remove: () => {} };
    });
    await mount();
    const mine = await ringOut(user);
    // Android froze the timer: the clock moves on, the timeout never fires.
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now + RING_MS + 5000);
    signal.send.mockClear();
    await act(async () => listeners.forEach((fn) => fn('active')));
    expect(signal.send).toHaveBeenCalledWith('user-kofi', 'end', { callId: mine.callId });
    expect(screen.getByTestId('call-status')).toHaveTextContent('No answer');
    clock.mockRestore();
    spy.mockRestore();
    await act(async () => jest.advanceTimersByTime(2000));
    expect(screen.queryByTestId('call-screen')).toBeNull();
  });
});

describe('the call screen layout', () => {
  test('the filter chips sit in the column right above the dock, not pinned to the bottom edge', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/components/calls/CallScreen.js'), 'utf8');
    expect(src).not.toMatch(/height \* 0\.08/);
    expect(src).toMatch(/center: \{\s*flex: 1,\s*alignItems: 'center',\s*justifyContent: 'center'/);
    expect(src).not.toMatch(/bottom: \{\s*position: 'absolute'/);
    expect(src.indexOf('testID="call-filter-line"')).toBeLessThan(src.indexOf('testID="call-controls"'));
  });
});

describe('waking a locked Android phone', () => {
  const { Alert, Platform } = require('react-native');
  const BoaCall = require('../modules/boa-call');
  const { nextWakeStep, askForCallWakeUp } = require('../src/calls/wakeUp');
  const os = Platform.OS;
  beforeEach(() => {
    Platform.OS = 'android';
  });
  afterEach(() => {
    Platform.OS = os;
    jest.restoreAllMocks();
  });

  test('asks nothing when calls can already ring full screen: no battery or overlay prompts, ever', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    expect(await nextWakeStep()).toBeNull();
    await askForCallWakeUp();
    expect(alert).not.toHaveBeenCalled();
    expect(BoaCall.isIgnoringBatteryOptimizations).toBeUndefined();
    expect(BoaCall.canDrawOverlays).toBeUndefined();
  });

  test('if full-screen calls are switched off, one plain question, then not again for a month', async () => {
    const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default ?? jest.requireMock('@react-native-async-storage/async-storage');
    await AsyncStorage.clear();
    BoaCall.canUseFullScreen.mockReturnValue(false);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await askForCallWakeUp();
    expect(alert).toHaveBeenCalledWith('Ring like a phone call?', expect.stringMatching(/full-screen/), expect.any(Array));
    alert.mock.calls[0][2].find((b) => b.text === 'Allow').onPress();
    expect(BoaCall.openFullScreenSettings).toHaveBeenCalled();
    await act(async () => {});
    expect(await nextWakeStep()).toBeNull();
    BoaCall.canUseFullScreen.mockReturnValue(true);
  });

  test('no prompt-only permissions; a phone-call foreground service rings, with a native call screen', () => {
    const perms = require('../app.json').expo.android.permissions;
    expect(perms).not.toEqual(expect.arrayContaining(['android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS']));
    expect(perms).not.toEqual(expect.arrayContaining(['android.permission.SYSTEM_ALERT_WINDOW']));
    const manifest = fs.readFileSync(path.join(__dirname, '../modules/boa-call/android/src/main/AndroidManifest.xml'), 'utf8');
    expect(manifest).not.toMatch(/BATTERY|SYSTEM_ALERT_WINDOW/);
    expect(manifest).toMatch(/FOREGROUND_SERVICE_PHONE_CALL/);
    expect(manifest).toMatch(/foregroundServiceType="phoneCall"/);
    expect(manifest).toMatch(/IncomingCallActivity[\s\S]*showWhenLocked="true"[\s\S]*turnScreenOn="true"/);
    const kt = (f) => fs.readFileSync(path.join(__dirname, '../modules/boa-call/android/src/main/java/expo/modules/boacall', f), 'utf8');
    // The full-screen intent opens the native call screen; the ring loops until it's over.
    expect(kt('CallNotification.kt')).toMatch(/setFullScreenIntent\(fullScreen, true\)/);
    expect(kt('CallNotification.kt')).toMatch(/IncomingCallActivity::class.java/);
    expect(kt('Ringer.kt')).toMatch(/isLooping = true/);
    expect(kt('Ringer.kt')).toMatch(/RINGER_MODE_SILENT/);
    expect(kt('IncomingCallService.kt')).toMatch(/FOREGROUND_SERVICE_TYPE_PHONE_CALL/);
    // Decline anywhere stops the ring at once.
    expect(kt('CallDeclineReceiver.kt')).toMatch(/IncomingCallService.stop\(context\)/);
  });
});
