import fs from 'fs';
import path from 'path';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

jest.useFakeTimers();

let mockHub;
jest.mock('../src/context/HubContext', () => ({ useHub: () => mockHub }));
jest.mock('../src/api/hub', () => ({
  ...jest.requireActual('../src/api/hub'),
  amIAdmin: jest.fn(async () => false),
  startConversation: jest.fn(async () => 'conv-kofi'),
}));
jest.mock('../src/navigation/ref', () => ({
  ...jest.requireActual('../src/navigation/ref'),
  openPage: jest.fn(() => true),
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
  pushCancel: jest.fn(async () => true),
}));
jest.mock('../src/calls/presence', () => ({
  BEAT_MS: 5000,
  announce: jest.fn(async () => true),
  retract: jest.fn(async () => true),
  otherPhoneCall: jest.fn(async () => null),
}));
jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(async () => null),
  addEventListener: jest.fn(() => ({ remove: () => {} })),
}));
jest.mock('../src/calls/token', () => ({ fetchToken: jest.fn(async (channel) => ({ appId: 'boa-app-id', token: 'tok-1', uid: 4242, channel })) }));

const signal = require('../src/calls/signaling');
const presence = require('../src/calls/presence');
const { __engine: engine } = require('react-native-agora');
const { CallProvider, useCall } = require('../src/context/CallContext');
const { cancelFromPush } = require('../src/calls/incoming');
const { DEVICE_ID } = require('../src/calls/device');

const ME = { id: 'user-me', username: 'ama', display_name: 'Ama Mensah', avatar_url: null };
const KOFI = { id: 'user-kofi', username: 'kofi', display_name: 'Kofi Boateng', avatar_url: null };
const KOFI_P = { id: 'user-kofi', name: 'Kofi Boateng', avatar_url: null };
const LISA = { id: 'user-lisa', name: 'Lisa Owusu', avatar_url: null };
const handler = () => engine.registerEventHandler.mock.calls.at(-1)[0];

beforeEach(() => {
  mockHub = { userId: 'user-me', profile: ME, isAdmin: false, blocked: new Set(), block: jest.fn(async () => {}) };
  signal.send.mockClear();
  signal.pushCancel.mockClear();
  presence.announce.mockClear();
  presence.retract.mockClear();
  presence.otherPhoneCall.mockReset();
  presence.otherPhoneCall.mockImplementation(async () => null);
});

function Dial() {
  const { startCall } = useCall();
  return <Text onPress={() => startCall(KOFI)}>Call Kofi</Text>;
}
const mount = () =>
  render(
    <GestureHandlerRootView>
      <CallProvider>
        <Dial />
      </CallProvider>
    </GestureHandlerRootView>,
  );
const sent = (event) => signal.send.mock.calls.filter(([, e]) => e === event);

// You call Kofi and he answers: a live call, with Kofi.
async function liveWithKofi(user) {
  await mount();
  await user.press(screen.getByText('Call Kofi'));
  await act(async () => {});
  const { callId } = sent('ring')[0][2];
  await act(async () => mockSignal('accept', { callId, by: 'user-kofi' }));
  await act(async () => handler().onJoinChannelSuccess({}, 10));
  return callId;
}
const lisaRings = (callId = 'b0000000-0000-4000-8000-000000000001') => act(async () => mockSignal('ring', { callId, from: LISA, sentAt: Date.now() }));

describe('a call back after a missed call', () => {
  test('a new ring from the same person replaces their old, dead ring: never "busy"', async () => {
    await mount();
    await act(async () => mockSignal('ring', { callId: 'a0000000-0000-4000-8000-000000000001', from: KOFI_P, sentAt: Date.now() }));
    expect(screen.getByTestId('call-accept')).toBeOnTheScreen();
    signal.send.mockClear();
    await act(async () => mockSignal('ring', { callId: 'a0000000-0000-4000-8000-000000000002', from: KOFI_P, sentAt: Date.now() }));
    expect(sent('busy')).toHaveLength(0);
    expect(screen.getByTestId('call-accept')).toBeOnTheScreen();
  });

  test('a real second call on your phone is still told busy, with no ring on top of the first', async () => {
    await mount();
    await act(async () => mockSignal('ring', { callId: 'a0000000-0000-4000-8000-000000000003', from: KOFI_P, sentAt: Date.now() }));
    signal.send.mockClear();
    await act(async () => mockSignal('ring', { callId: 'a0000000-0000-4000-8000-000000000004', from: LISA, sentAt: Date.now() }));
    expect(sent('busy')).toHaveLength(1);
    expect(screen.getByTestId('call-name')).toHaveTextContent('Kofi Boateng');
  });
});

describe('call waiting', () => {
  test('someone rings during your call: a banner over it, they hear "call waiting", your call carries on', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await liveWithKofi(user);
    signal.send.mockClear();
    await lisaRings('b0000000-0000-4000-8000-000000000001');
    expect(screen.getByTestId('call-waiting-banner')).toBeOnTheScreen();
    expect(screen.getByTestId('call-waiting-name')).toHaveTextContent('Lisa Owusu');
    expect(sent('waiting')[0]).toEqual(['user-lisa', 'waiting', expect.objectContaining({ callId: 'b0000000-0000-4000-8000-000000000001' })]);
    expect(sent('busy')).toHaveLength(0);
    expect(screen.getByTestId('call-name')).toHaveTextContent('Kofi Boateng');
    expect(screen.getByTestId('call-end')).toBeOnTheScreen();
  });

  test('the caller who is waiting sees "Call waiting"', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    await user.press(screen.getByText('Call Kofi'));
    await act(async () => {});
    const { callId } = sent('ring')[0][2];
    await act(async () => mockSignal('waiting', { callId }));
    expect(screen.getByTestId('call-status')).toHaveTextContent(/Call waiting/);
  });

  test('Decline sends the new caller away busy and leaves your call alone', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await liveWithKofi(user);
    await lisaRings('b0000000-0000-4000-8000-000000000002');
    signal.send.mockClear();
    await user.press(screen.getByTestId('call-waiting-decline'));
    expect(sent('busy')[0]).toEqual(['user-lisa', 'busy', expect.objectContaining({ callId: 'b0000000-0000-4000-8000-000000000002' })]);
    expect(screen.queryByTestId('call-waiting-banner')).toBeNull();
    expect(sent('end')).toHaveLength(0);
    expect(screen.getByTestId('call-name')).toHaveTextContent('Kofi Boateng');
  });

  test('End & Accept hangs up on the first call and answers the new one', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const first = await liveWithKofi(user);
    const second = 'b0000000-0000-4000-8000-000000000003';
    await lisaRings(second);
    signal.send.mockClear();
    engine.joinChannel.mockClear();
    await user.press(screen.getByTestId('call-waiting-end-accept'));
    await act(async () => {});
    expect(sent('end')[0]).toEqual(['user-kofi', 'end', expect.objectContaining({ callId: first })]);
    expect(sent('accept')[0]).toEqual(['user-lisa', 'accept', expect.objectContaining({ callId: second, by: 'user-me' })]);
    expect(screen.getByTestId('call-name')).toHaveTextContent('Lisa Owusu');
    expect(screen.queryByTestId('call-waiting-banner')).toBeNull();
    expect(engine.joinChannel).toHaveBeenCalledWith('tok-1', second, 4242, expect.anything());
  });

  test('Merge puts the new caller on your call: one channel, both told, and hanging up ends it for everyone', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const first = await liveWithKofi(user);
    const second = 'b0000000-0000-4000-8000-000000000004';
    await lisaRings(second);
    signal.send.mockClear();
    await user.press(screen.getByTestId('call-waiting-merge'));
    // Lisa is sent into the channel your call is already on.
    expect(sent('accept')[0]).toEqual(['user-lisa', 'accept', expect.objectContaining({ callId: second, join: first })]);
    // Each is told about the other.
    expect(sent('party').map(([to]) => to).sort()).toEqual(['user-kofi', 'user-lisa']);
    expect(screen.queryByTestId('call-waiting-banner')).toBeNull();
    expect(screen.getByTestId('call-name')).toHaveTextContent('Kofi Boateng and Lisa Owusu');
    // Your end ends it for both.
    signal.send.mockClear();
    await user.press(screen.getByTestId('call-end'));
    expect(sent('end').map(([to]) => to).sort()).toEqual(['user-kofi', 'user-lisa']);
  });

  test('a call waiting that nobody answers becomes a missed call and the banner goes', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await liveWithKofi(user);
    await lisaRings('b0000000-0000-4000-8000-000000000005');
    expect(screen.getByTestId('call-waiting-banner')).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(60000));
    expect(screen.queryByTestId('call-waiting-banner')).toBeNull();
    expect(screen.getByTestId('call-name')).toHaveTextContent('Kofi Boateng');
  });

  test('the caller giving up takes the banner away', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await liveWithKofi(user);
    const second = 'b0000000-0000-4000-8000-000000000006';
    await lisaRings(second);
    await act(async () => mockSignal('end', { callId: second }));
    expect(screen.queryByTestId('call-waiting-banner')).toBeNull();
  });
});

describe('two phones, one account', () => {
  test('answering here tells your other phone to stop ringing, by Realtime and by push, before the caller hears anything', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    const id = 'c0000000-0000-4000-8000-000000000001';
    await act(async () => mockSignal('ring', { callId: id, from: KOFI_P, sentAt: Date.now() }));
    signal.send.mockClear();
    await user.press(screen.getByTestId('call-accept'));
    expect(sent('answered')[0]).toEqual(['user-me', 'answered', { callId: id }]);
    expect(signal.pushCancel).toHaveBeenCalledWith('user-me', id);
    const order = signal.send.mock.calls.map(([, e]) => e);
    expect(order.indexOf('answered')).toBeLessThan(order.indexOf('accept'));
  });

  test('declining here stops it ringing there too, with the decline going out last', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await mount();
    const id = 'c0000000-0000-4000-8000-000000000002';
    await act(async () => mockSignal('ring', { callId: id, from: KOFI_P, sentAt: Date.now() }));
    signal.send.mockClear();
    await user.press(screen.getByTestId('call-decline'));
    expect(sent('answered')).toHaveLength(1);
    expect(signal.send.mock.calls.at(-1)[1]).toBe('decline');
  });

  test('the other phone answering first stops the ring here at once', async () => {
    await mount();
    const id = 'c0000000-0000-4000-8000-000000000003';
    await act(async () => mockSignal('ring', { callId: id, from: KOFI_P, sentAt: Date.now() }));
    expect(screen.getByTestId('call-accept')).toBeOnTheScreen();
    await act(async () => mockSignal('answered', { callId: id }));
    expect(screen.queryByTestId('call-accept')).toBeNull();
    // And a ring that turns up late for a call answered elsewhere never rings at all.
    await act(async () => jest.advanceTimersByTime(2500));
    await act(async () => mockSignal('ring', { callId: id, from: KOFI_P, sentAt: Date.now() }));
    expect(screen.queryByTestId('call-accept')).toBeNull();
  });

  test('a cancel push (the caller hung up, or you answered elsewhere) reads as a stop, never a call', () => {
    expect(cancelFromPush({ type: 'call-cancel', callId: 'x1', reason: 'elsewhere' })).toEqual({ callId: 'x1', reason: 'elsewhere' });
    expect(cancelFromPush({ type: 'call-cancel', callId: 'x2' })).toEqual({ callId: 'x2', reason: 'cancelled' });
    expect(cancelFromPush({ type: 'call', callId: 'x3' })).toBeNull();
    expect(cancelFromPush(null)).toBeNull();
  });

  test('a live call announces itself for your other phone, and takes it back when it ends', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await liveWithKofi(user);
    expect(presence.announce).toHaveBeenCalledWith('user-me', expect.objectContaining({ phase: 'active' }));
    expect(sent('nudge').length).toBeGreaterThan(0);
    await user.press(screen.getByTestId('call-end'));
    await act(async () => {});
    expect(presence.retract).toHaveBeenCalledWith('user-me');
  });

  test('the phone that was called a moment ago ends its own call, silently, when its other phone takes it', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const id = await liveWithKofi(user);
    signal.send.mockClear();
    await act(async () => mockSignal('transfer', { callId: id, device: 'phone-b', toDevice: DEVICE_ID }));
    expect(sent('released')[0]).toEqual(['user-me', 'released', { callId: id, toDevice: 'phone-b' }]);
    // The other person is never told the call ended.
    expect(sent('end')).toHaveLength(0);
  });

  const offer = (over = {}) => ({
    callId: 'd0000000-0000-4000-8000-000000000001',
    channel: 'd0000000-0000-4000-8000-000000000001',
    device: 'phone-a',
    voice: false,
    startedAt: Date.now() - 90000,
    peer: KOFI_P,
    ...over,
  });

  test('picking up the other phone offers to move the call, and Yes moves it', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    presence.otherPhoneCall.mockImplementation(async () => offer());
    await mount();
    await act(async () => {});
    expect(screen.getByTestId('transfer-text')).toHaveTextContent('Call is active on another device. Transfer call to this device?');
    engine.joinChannel.mockClear();
    await user.press(screen.getByTestId('transfer-yes'));
    expect(sent('transfer')[0]).toEqual(['user-me', 'transfer', { callId: offer().callId, toDevice: 'phone-a' }]);
    // The other phone lets go first (one account, one uid): only then does this one join.
    expect(engine.joinChannel).not.toHaveBeenCalled();
    presence.otherPhoneCall.mockImplementation(async () => null);
    await act(async () => mockSignal('released', { callId: offer().callId }));
    await act(async () => {});
    expect(sent('moved')[0]).toEqual(['user-kofi', 'moved', { callId: offer().callId }]);
    expect(engine.joinChannel).toHaveBeenCalledWith('tok-1', offer().callId, 4242, expect.anything());
    expect(screen.queryByTestId('transfer-prompt')).toBeNull();
    expect(screen.getByTestId('call-name')).toHaveTextContent('Kofi Boateng');
  });

  test('No leaves the call where it is, and does not ask again for that call', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    presence.otherPhoneCall.mockImplementation(async () => offer({ callId: 'd0000000-0000-4000-8000-000000000002' }));
    await mount();
    await act(async () => {});
    await user.press(screen.getByTestId('transfer-no'));
    expect(screen.queryByTestId('transfer-prompt')).toBeNull();
    expect(sent('transfer')).toHaveLength(0);
    await act(async () => jest.advanceTimersByTime(12000));
    expect(screen.queryByTestId('transfer-prompt')).toBeNull();
  });

  test('the offer goes when the other phone hangs up', async () => {
    presence.otherPhoneCall.mockImplementation(async () => offer({ callId: 'd0000000-0000-4000-8000-000000000003' }));
    await mount();
    await act(async () => {});
    expect(screen.getByTestId('transfer-prompt')).toBeOnTheScreen();
    presence.otherPhoneCall.mockImplementation(async () => null);
    await act(async () => mockSignal('nudge', {}));
    expect(screen.queryByTestId('transfer-prompt')).toBeNull();
  });
});

describe('the server side', () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

  test('call-push can stop a ring, and only the caller or you may', () => {
    const src = read('supabase/functions/call-push/index.ts');
    expect(src).toMatch(/action === 'cancel'/);
    expect(src).toMatch(/call-cancel/);
    expect(src).toMatch(/elsewhere/);
  });

  test('presence is a table only you can write to, so nobody can fake your call', () => {
    const sql = read('supabase/migrations/20261110120000_call_presence.sql');
    expect(sql).toMatch(/create table if not exists public\.active_calls/i);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/user_id = \(select auth\.uid\(\)\)|user_id = auth\.uid\(\)/);
  });

  test('the Realtime listener ignores your own device and anything meant for the other one', () => {
    const src = read('src/calls/signaling.js');
    expect(src).toMatch(/p\.device === DEVICE_ID\) return/);
    expect(src).toMatch(/p\.toDevice !== DEVICE_ID\) return/);
  });

  test('the waiting tone is a bundled sound, not a download', () => {
    expect(fs.existsSync(path.join(__dirname, '../assets/sounds/call-waiting.wav'))).toBe(true);
  });
});
