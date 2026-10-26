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
}));
// Our backend's answer: the Agora App ID, a token and this person's uid.
jest.mock('../src/calls/token', () => ({ fetchToken: jest.fn(async () => ({ appId: 'boa-app-id', token: 'tok-1', uid: 4242 })) }));

const hub = require('../src/api/hub');
const signal = require('../src/calls/signaling');
const { fetchToken } = require('../src/calls/token');
const { __engine: engine, createAgoraRtcEngine } = require('react-native-agora');
const { PremiumProvider } = require('../src/context/PremiumContext');
const { CallProvider, useCall } = require('../src/context/CallContext');
const { ENCODER, CAPTURE, DENOISER, LOW_LIGHT, HD, PREVIEW, STABILIZATION_OFF } = require('../src/calls/quality');
const { createAudioPlayer } = require('expo-audio');
const { RINGTONE } = require('../src/calls/ringtone');

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
  test('720p30 once live, quality first, never trading sharpness for frames', () => {
    expect(HD).toEqual({ width: 1280, height: 720, fps: 30 });
    expect(ENCODER.dimensions).toEqual({ width: 1280, height: 720 });
    expect(ENCODER.frameRate).toBe(30);
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

  test('low light and denoising are on, auto, high quality', () => {
    expect(LOW_LIGHT).toEqual({ mode: 0, level: 0 });
    expect(DENOISER).toEqual({ mode: 0, level: 0 });
  });
});

describe('Agora video calls', () => {
  test('ring, preview, join with our token, see them, mute, camera off, hang up', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    await user.press(screen.getByText('Call Kofi'));
    const { callId } = signal.send.mock.calls.at(-1)[2];
    await act(async () => {});

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
    expect(engine.setBeautyEffectOptions).toHaveBeenCalledWith(true, expect.objectContaining({ lighteningLevel: 0 }));
    expect(engine.startPreview).toHaveBeenCalled();
    expect(engine.joinChannel).not.toHaveBeenCalled();
    expect(screen.getByTestId('call-local-video')).toBeOnTheScreen();

    // They answer: join the call's channel.
    await act(async () => mockSignal('accept', { callId }));
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

    // Filters off reach the camera too.
    await user.press(screen.getByTestId('call-filters-button'));
    await user.press(screen.getByTestId('call-filters-toggle'));
    expect(engine.setBeautyEffectOptions).toHaveBeenLastCalledWith(false, expect.anything());

    // They hang up while the picture's frozen; then the call ends and the camera is let go.
    await user.press(screen.getByTestId('call-end'));
    expect(engine.leaveChannel).toHaveBeenCalled();
    expect(engine.stopPreview).toHaveBeenCalled();
    expect(engine.unregisterEventHandler).toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(2000));
    expect(screen.queryByTestId('call-screen')).toBeNull();
  });

  test('an answered incoming call joins; a token that fails says so instead of hanging', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    fetchToken.mockRejectedValueOnce(new Error('Video calls are not set up yet.'));
    engine.joinChannel.mockClear();
    await mount();
    await act(async () => mockSignal('ring', { callId: 'a7c3e1f0-0000-4000-8000-000000000001', from: { id: 'user-kofi', name: 'Kofi Boateng' } }));
    await user.press(screen.getByTestId('call-accept'));
    await act(async () => {});
    expect(engine.joinChannel).not.toHaveBeenCalled();
    expect(screen.getByTestId('call-video-note')).toHaveTextContent("Video couldn't connect: Video calls are not set up yet.");
    await user.press(screen.getByTestId('call-end'));
    await act(async () => jest.advanceTimersByTime(2000));

    // Next call works.
    await act(async () => mockSignal('ring', { callId: 'a7c3e1f0-0000-4000-8000-000000000002', from: { id: 'user-kofi', name: 'Kofi Boateng' } }));
    await user.press(screen.getByTestId('call-accept'));
    await act(async () => {});
    expect(engine.joinChannel).toHaveBeenCalledWith('tok-1', 'a7c3e1f0-0000-4000-8000-000000000002', 4242, expect.anything());
  });
});

describe('the ringtone', () => {
  test('rings out loud and loops while an incoming call rings; answering stops it', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    createAudioPlayer.mockClear();
    await act(async () => mockSignal('ring', { callId: 'c1c3e1f0-0000-4000-8000-000000000001', from: { id: 'user-kofi', name: 'Kofi Boateng' } }));
    const tone = createAudioPlayer.mock.results.at(-1).value;
    expect(createAudioPlayer).toHaveBeenCalledWith(RINGTONE);
    expect(tone.loop).toBe(true);
    expect(tone.play).toHaveBeenCalled();
    await user.press(screen.getByTestId('call-accept'));
    expect(tone.pause).toHaveBeenCalled();
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

    test('if Agora refuses the join, the screen says so with the code, not a black screen', async () => {
      jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue({ 'android.permission.CAMERA': GRANTED, 'android.permission.RECORD_AUDIO': GRANTED });
      engine.joinChannel.mockReturnValueOnce(-17);
      const user = await answer('b1c3e1f0-0000-4000-8000-000000000003');
      expect(screen.getByTestId('call-video-note')).toHaveTextContent("Video couldn't connect: Agora error 17");
      await user.press(screen.getByTestId('call-end'));
      await act(async () => jest.advanceTimersByTime(2000));
    });
  });
});
