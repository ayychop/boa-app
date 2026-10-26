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
const { ENCODER, CAPTURE, DENOISER, LOW_LIGHT, HD } = require('../src/calls/quality');

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
  test('1080p30, quality first, never trading sharpness for frames', () => {
    expect(HD).toEqual({ width: 1920, height: 1080, fps: 30 });
    expect(ENCODER.dimensions).toEqual({ width: 1920, height: 1080 });
    expect(ENCODER.degradationPreference).toBe(0); // MaintainQuality
    expect(ENCODER.advanceOptions.compressionPreference).toBe(1); // PreferQuality
    expect(CAPTURE.format).toEqual({ width: 1920, height: 1080, fps: 30 });
    expect(CAPTURE.cameraDirection).toBe(1); // front
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
    expect(engine.setVideoEncoderConfiguration).toHaveBeenCalledWith(ENCODER);
    expect(engine.setCameraCapturerConfiguration).toHaveBeenCalledWith(CAPTURE);
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
    await act(async () => handler().onJoinChannelSuccess({}, 10));
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
    expect(screen.getByTestId('call-video-note')).toHaveTextContent("Video couldn't connect");
    await user.press(screen.getByTestId('call-end'));
    await act(async () => jest.advanceTimersByTime(2000));

    // Next call works.
    await act(async () => mockSignal('ring', { callId: 'a7c3e1f0-0000-4000-8000-000000000002', from: { id: 'user-kofi', name: 'Kofi Boateng' } }));
    await user.press(screen.getByTestId('call-accept'));
    await act(async () => {});
    expect(engine.joinChannel).toHaveBeenCalledWith('tok-1', 'a7c3e1f0-0000-4000-8000-000000000002', 4242, expect.anything());
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
  test('the certificate never appears in the app', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/calls/media.native.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '../src/calls/token.js'), 'utf8');
    expect(src).not.toMatch(/AGORA_APP_CERTIFICATE|appCertificate|buildToken/);
  });
});
