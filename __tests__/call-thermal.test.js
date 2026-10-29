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
const thermal = require('../src/calls/thermal');
const media = require('../src/calls/media.native');
const { COOL_ENCODER, ENCODER, PREVIEW, encoderForThermal } = require('../src/calls/quality');
const { PremiumProvider } = require('../src/context/PremiumContext');
const { CallProvider, useCall } = require('../src/context/CallContext');

const KOFI = { id: 'user-kofi', username: 'kofi', display_name: 'Kofi Boateng', avatar_url: null };

let appListeners;
let appSpy;
beforeEach(() => {
  mockHub = { userId: 'user-me', profile: { id: 'user-me', username: 'ama', display_name: 'Ama' }, isAdmin: false, blocked: new Set(), block: jest.fn(async () => {}) };
  hub.getPremiumAccess.mockResolvedValue({ status: 'trial', hasAccess: true, isAdmin: false, trialEndsAt: new Date(Date.now() + 47 * 3600e3).toISOString() });
  appListeners = [];
  appSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
    appListeners.push(fn);
    return { remove: () => appListeners.splice(appListeners.indexOf(fn), 1) };
  });
  jest.clearAllMocks();
});
afterEach(() => {
  appSpy.mockRestore();
  thermal.setState(thermal.NOMINAL);
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
const appGoes = (state) => act(async () => appListeners.slice().forEach((fn) => fn(state)));

async function liveCall(user) {
  await mount();
  await user.press(screen.getByText('Call Kofi'));
  const { callId } = signal.send.mock.calls.at(-1)[2];
  await act(async () => {});
  await act(async () => mockSignal('accept', { callId }));
  await act(async () => handler().onJoinChannelSuccess({}, 10));
}

describe('the encoder for a hot phone', () => {
  test('WARNING and CRITICAL drop to 720p and hold 60 fps; anything cooler stays 1080p', () => {
    expect(COOL_ENCODER.dimensions).toEqual({ width: 1280, height: 720 });
    expect(COOL_ENCODER.frameRate).toBe(60);
    expect(COOL_ENCODER.degradationPreference).toBe(1); // MaintainFramerate: never choppy
    expect(encoderForThermal('WARNING')).toBe(COOL_ENCODER);
    expect(encoderForThermal('CRITICAL')).toBe(COOL_ENCODER);
    expect(encoderForThermal('FAIR')).toBe(ENCODER);
    expect(encoderForThermal('NOMINAL')).toBe(ENCODER);
    expect(encoderForThermal(undefined)).toBe(ENCODER);
  });
});

describe('a live call as the phone heats up', () => {
  test('hot: 720p60 at once; cooled down: back to 1080p; ringing stays on the small preview', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    await user.press(screen.getByText('Call Kofi'));
    const { callId } = signal.send.mock.calls.at(-1)[2];
    await act(async () => {});
    // Hot while it rings: still the fast preview until the call is live.
    await act(async () => thermal.setState('WARNING'));
    expect(engine.setVideoEncoderConfiguration).toHaveBeenLastCalledWith(PREVIEW);

    await act(async () => mockSignal('accept', { callId }));
    await act(async () => handler().onJoinChannelSuccess({}, 10));
    expect(engine.setVideoEncoderConfiguration).toHaveBeenLastCalledWith(COOL_ENCODER);

    await act(async () => thermal.setState('NOMINAL'));
    expect(engine.setVideoEncoderConfiguration).toHaveBeenLastCalledWith(ENCODER);
    await act(async () => thermal.setState('CRITICAL'));
    expect(engine.setVideoEncoderConfiguration).toHaveBeenLastCalledWith(COOL_ENCODER);

    await user.press(screen.getByTestId('call-end'));
    await act(async () => jest.advanceTimersByTime(2000));
  });

  test('once the call is over, heat no longer touches the camera', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await liveCall(user);
    await user.press(screen.getByTestId('call-end'));
    await act(async () => jest.advanceTimersByTime(2000));
    engine.setVideoEncoderConfiguration.mockClear();
    await act(async () => thermal.setState('CRITICAL'));
    expect(engine.setVideoEncoderConfiguration).not.toHaveBeenCalled();
  });
});

describe('the camera engine is let go', () => {
  test('a call that ends releases the engine, camera off first', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await liveCall(user);
    engine.release.mockClear();
    engine.enableLocalVideo.mockClear();
    await user.press(screen.getByTestId('call-end'));
    expect(engine.enableLocalVideo).toHaveBeenCalledWith(false);
    expect(engine.stopPreview).toHaveBeenCalled();
    expect(engine.release).toHaveBeenCalledTimes(1);
    expect(engine.enableLocalVideo.mock.invocationCallOrder.at(-1)).toBeLessThan(engine.release.mock.invocationCallOrder.at(-1));
    await act(async () => jest.advanceTimersByTime(2000));
  });

  test('backgrounded mid-call, the camera stops while the sound carries on', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await liveCall(user);
    engine.enableLocalVideo.mockClear();
    const leaves = engine.leaveChannel.mock.calls.length;
    await appGoes('background');
    await act(async () => jest.advanceTimersByTime(1000));
    expect(engine.enableLocalVideo).toHaveBeenLastCalledWith(false);
    expect(engine.stopPreview).toHaveBeenCalled();
    expect(engine.leaveChannel.mock.calls.length).toBe(leaves);
    await appGoes('active');
    expect(engine.enableLocalVideo).toHaveBeenLastCalledWith(true);
    await user.press(screen.getByTestId('call-end'));
    await act(async () => jest.advanceTimersByTime(2000));
  });

  test('backgrounded with no call: a warmed-up engine is released', async () => {
    await mount();
    await act(async () => {
      await media.warmUp('call-idle');
    });
    engine.release.mockClear();
    await appGoes('background');
    expect(engine.release).toHaveBeenCalledTimes(1);
  });
});
