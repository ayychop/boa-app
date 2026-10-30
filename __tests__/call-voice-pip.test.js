import { act, render, screen, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

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
jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(async () => null),
  addEventListener: jest.fn(() => ({ remove: () => {} })),
}));
jest.mock('../src/calls/token', () => ({ fetchToken: jest.fn(async () => ({ appId: 'boa-app-id', token: 'tok-1', uid: 4242 })) }));

const hub = require('../src/api/hub');
const signal = require('../src/calls/signaling');
const { PremiumProvider } = require('../src/context/PremiumContext');
const { CallProvider, useCall } = require('../src/context/CallContext');

const ME = { id: 'user-me', username: 'ama', display_name: 'Ama Mensah', avatar_url: null };
const KOFI = { id: 'user-kofi', username: 'kofi', display_name: 'Kofi Boateng', avatar_url: null };

beforeEach(() => {
  mockHub = { userId: 'user-me', profile: ME, isAdmin: false, blocked: new Set(), block: jest.fn(async () => {}) };
  hub.getPremiumAccess.mockResolvedValue({ status: 'trial', hasAccess: true, isAdmin: false, trialEndsAt: new Date(Date.now() + 47 * 3600e3).toISOString() });
  signal.send.mockClear();
});

function Dial() {
  const { startCall, controls } = useCall();
  return (
    <>
      <Text onPress={() => startCall(KOFI)}>Video Kofi</Text>
      <Text onPress={() => startCall(KOFI, { voice: true })}>Voice Kofi</Text>
      <Text testID="camera-off">{String(controls.cameraOff)}</Text>
    </>
  );
}
const mount = () =>
  render(
    <GestureHandlerRootView>
      <PremiumProvider>
        <CallProvider>
          <Dial />
        </CallProvider>
      </PremiumProvider>
    </GestureHandlerRootView>,
  );

describe('Voice call only', () => {
  test('a video call rings with video: true', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    await user.press(screen.getByText('Video Kofi'));
    await act(async () => {});
    expect(signal.send.mock.calls.at(-1)[1]).toBe('ring');
    expect(signal.send.mock.calls.at(-1)[2].video).toBe(true);
    expect(screen.getByTestId('camera-off')).toHaveTextContent('false');
  });

  test('a voice call rings with video: false and starts with the camera off', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    await user.press(screen.getByText('Voice Kofi'));
    await act(async () => {});
    expect(signal.send.mock.calls.at(-1)[1]).toBe('ring');
    expect(signal.send.mock.calls.at(-1)[2].video).toBe(false);
    expect(screen.getByTestId('camera-off')).toHaveTextContent('true');
  });

  test('an incoming voice ring says so, and a video ring still says video', async () => {
    await mount();
    await act(async () => mockSignal('ring', { callId: 'c-voice', video: false, from: { id: 'user-kofi', name: 'Kofi Boateng' } }));
    expect(screen.getByTestId('call-status')).toHaveTextContent('Incoming voice call');
    await act(async () => mockSignal('end', { callId: 'c-voice' }));
    await act(async () => jest.advanceTimersByTime(2000));
    await act(async () => mockSignal('ring', { callId: 'c-video', video: true, from: { id: 'user-kofi', name: 'Kofi Boateng' } }));
    expect(screen.getByTestId('call-status')).toHaveTextContent('Incoming video call');
  });
});
