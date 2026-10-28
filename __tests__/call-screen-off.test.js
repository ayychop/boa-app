import fs from 'fs';
import path from 'path';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';

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
jest.mock('../src/calls/token', () => ({ fetchToken: jest.fn(async () => ({ appId: 'boa-app-id', token: 'tok-1', uid: 4242 })) }));

const hub = require('../src/api/hub');
const signal = require('../src/calls/signaling');
const { __engine: engine } = require('react-native-agora');
const KeepAwake = require('expo-keep-awake');
const BoaCall = require('../modules/boa-call');
const { PremiumProvider } = require('../src/context/PremiumContext');
const { CallProvider, useCall } = require('../src/context/CallContext');

const ME = { id: 'user-me', username: 'ama', display_name: 'Ama Mensah', avatar_url: null };
const KOFI = { id: 'user-kofi', username: 'kofi', display_name: 'Kofi Boateng', avatar_url: null };

let appListeners;
let appSpy;
beforeEach(() => {
  mockHub = { userId: 'user-me', profile: ME, isAdmin: false, blocked: new Set(), block: jest.fn(async () => {}) };
  hub.getPremiumAccess.mockResolvedValue({ status: 'trial', hasAccess: true, isAdmin: false, trialEndsAt: new Date(Date.now() + 47 * 3600e3).toISOString() });
  appListeners = [];
  appSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
    appListeners.push(fn);
    return { remove: () => appListeners.splice(appListeners.indexOf(fn), 1) };
  });
  jest.clearAllMocks();
});
afterEach(() => appSpy.mockRestore());

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
const appGoes = (state) => act(async () => appListeners.slice().forEach((fn) => fn(state)));

async function liveCall(user) {
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
  return callId;
}

const lastCamera = () => engine.enableLocalVideo.mock.calls.at(-1)?.[0];

describe('a video call with the screen off', () => {
  test('the screen never sleeps by itself on a call, and may again once it ends', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await liveCall(user);
    expect(KeepAwake.activateKeepAwakeAsync).toHaveBeenCalledWith('boa-call');
    expect(KeepAwake.deactivateKeepAwake).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('call-end'));
    expect(KeepAwake.deactivateKeepAwake).toHaveBeenCalledWith('boa-call');
    await act(async () => jest.advanceTimersByTime(2000));
  });

  test('the power button rests the camera and keeps the sound; back on, the picture is straight back', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await liveCall(user);
    engine.enableLocalVideo.mockClear();
    engine.muteLocalAudioStream.mockClear();
    const leaves = engine.leaveChannel.mock.calls.length;

    await act(async () => BoaCall.__screen(false));
    await appGoes('background');
    await act(async () => jest.advanceTimersByTime(1000));
    expect(lastCamera()).toBe(false);
    expect(engine.muteLocalVideoStream).toHaveBeenLastCalledWith(true);
    // Still in the call, still heard, still hearing them.
    expect(engine.muteLocalAudioStream).not.toHaveBeenCalledWith(true);
    expect(engine.leaveChannel.mock.calls.length).toBe(leaves);
    expect(engine.enableAudio).not.toHaveBeenCalledWith(false);

    await act(async () => BoaCall.__screen(true));
    await appGoes('active');
    expect(lastCamera()).toBe(true);
    expect(engine.muteLocalVideoStream).toHaveBeenLastCalledWith(false);
    expect(engine.updateChannelMediaOptions).toHaveBeenLastCalledWith({ publishCameraTrack: true });
    await user.press(screen.getByTestId('call-end'));
    await act(async () => jest.advanceTimersByTime(2000));
  });

  test('leaving the app into picture in picture keeps the camera on; leaving without it rests it', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await liveCall(user);
    engine.enableLocalVideo.mockClear();
    await appGoes('background');
    await act(async () => BoaCall.__pip(true));
    await act(async () => jest.advanceTimersByTime(1000));
    expect(engine.enableLocalVideo).not.toHaveBeenCalledWith(false);
    await act(async () => BoaCall.__pip(false));
    await act(async () => jest.advanceTimersByTime(1000));
    expect(lastCamera()).toBe(false);
    await appGoes('active');
    expect(lastCamera()).toBe(true);
    await user.press(screen.getByTestId('call-end'));
    await act(async () => jest.advanceTimersByTime(2000));
  });

  test('a camera you turned off stays off when you come back', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await liveCall(user);
    await user.press(screen.getByTestId('call-camera'));
    expect(lastCamera()).toBe(false);
    await appGoes('background');
    await act(async () => jest.advanceTimersByTime(1000));
    engine.enableLocalVideo.mockClear();
    await appGoes('active');
    expect(engine.enableLocalVideo).not.toHaveBeenCalledWith(true);
    await user.press(screen.getByTestId('call-end'));
    await act(async () => jest.advanceTimersByTime(2000));
  });

  test('an ongoing-call notification holds the call from start to end, and its Hang up ends it', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const callId = await liveCall(user);
    expect(BoaCall.startOngoing).toHaveBeenCalledWith('Kofi Boateng', callId);
    expect(BoaCall.stopOngoing).not.toHaveBeenCalled();
    signal.send.mockClear();
    await act(async () => BoaCall.__hangUp());
    expect(signal.send).toHaveBeenCalledWith('user-kofi', 'end', { callId });
    expect(BoaCall.stopOngoing).toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(2000));
  });

  test('the app keeps its sound and microphone in the background on both platforms', () => {
    const app = require('../app.json').expo;
    expect(app.ios.infoPlist.UIBackgroundModes).toEqual(expect.arrayContaining(['audio', 'voip']));
    expect(app.android.permissions).toEqual(
      expect.arrayContaining(['android.permission.FOREGROUND_SERVICE_PHONE_CALL', 'android.permission.FOREGROUND_SERVICE_MICROPHONE', 'android.permission.WAKE_LOCK']),
    );
    const manifest = fs.readFileSync(path.join(__dirname, '../modules/boa-call/android/src/main/AndroidManifest.xml'), 'utf8');
    expect(manifest).toMatch(/OngoingCallService"[\s\S]*?foregroundServiceType="phoneCall\|microphone"/);
    expect(manifest).toMatch(/FOREGROUND_SERVICE_MICROPHONE/);
    const kt = fs.readFileSync(path.join(__dirname, '../modules/boa-call/android/src/main/java/expo/modules/boacall/OngoingCallService.kt'), 'utf8');
    expect(kt).toMatch(/FOREGROUND_SERVICE_TYPE_MICROPHONE/);
    expect(kt).toMatch(/CallStyle\.forOngoingCall/);
  });
});
