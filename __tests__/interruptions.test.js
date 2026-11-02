import { act } from '@testing-library/react-native';

// The native guard, as a fake that tests can fire events through.
const mockGuard = (() => {
  const handlers = { call: new Set(), bt: new Set(), task: new Set() };
  const add = (set) => (fn) => {
    set.add(fn);
    return () => set.delete(fn);
  };
  const api = {
    isAvailable: true,
    start: jest.fn(),
    stop: jest.fn(),
    refresh: jest.fn(),
    callMode: jest.fn(() => 'none'),
    bluetoothAllowed: jest.fn(() => true),
    bluetoothAudio: jest.fn(() => false),
    addCallModeListener: add(handlers.call),
    addBluetoothListener: add(handlers.bt),
    addTaskRemovedListener: add(handlers.task),
    // A call event is also what the phone's audio mode now says.
    __fire: (kind, payload) => {
      if (kind === 'call') api.callMode.mockReturnValue(payload.mode);
      handlers[kind].forEach((fn) => fn(payload));
    },
  };
  return api;
})();
jest.mock('../modules/boa-audio-guard', () => mockGuard);

const engine = require('../src/audio/engine');
const ambient = require('../src/audio/ambient');
const interruptions = require('../src/audio/interruptions');

beforeEach(() => {
  jest.clearAllMocks();
  interruptions.reset();
  engine.playingFor.mockReturnValue(10000);
  engine.lastUserPause.mockReturnValue(0);
  mockGuard.callMode.mockReturnValue('none');
  interruptions.start();
});
afterEach(() => interruptions.reset());

describe('a call holds the radio', () => {
  test('a call on this phone, from any app, pauses it the moment it rings and lets it go when it ends', () => {
    mockGuard.__fire('call', { mode: 'ringing' });
    expect(engine.interrupt).toHaveBeenCalledWith('call');
    expect(interruptions.isOnCall()).toBe(true);
    expect(interruptions.callState()).toBe('ringing');
    mockGuard.__fire('call', { mode: 'call' });
    expect(interruptions.callState()).toBe('call');
    mockGuard.__fire('call', { mode: 'none' });
    expect(engine.endInterruption).toHaveBeenCalledWith('call');
    expect(interruptions.isOnCall()).toBe(false);
  });

  test("BOA's own video call counts as a call, until it ends", () => {
    interruptions.setAppCall(true);
    expect(engine.interrupt).toHaveBeenCalledWith('call');
    // Said twice, acted on once.
    engine.interrupt.mockClear();
    interruptions.setAppCall(true);
    expect(engine.interrupt).not.toHaveBeenCalled();
    interruptions.setAppCall(false);
    expect(engine.endInterruption).toHaveBeenCalledWith('call');
  });

  test('the native watch only runs while something plays or a call is on', async () => {
    jest.useFakeTimers();
    interruptions.reset();
    interruptions.start();
    expect(mockGuard.start).not.toHaveBeenCalled();
    act(() => engine.play({ kind: 'radio', id: 'r' }));
    expect(mockGuard.start).toHaveBeenCalledTimes(1);
    act(() => {
      engine.pause();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(4000);
    });
    expect(mockGuard.stop).toHaveBeenCalled();
    jest.useRealTimers();
  });
});

describe('another device taking the Bluetooth speaker (a car)', () => {
  beforeEach(() => act(() => engine.play({ kind: 'radio', id: 'r' })));

  test('the radio yields when the speaker stops taking its stream', () => {
    mockGuard.__fire('bt', { event: 'notPlaying' });
    expect(engine.interrupt).toHaveBeenCalledWith('bluetooth');
  });

  test('but not for a stall just after it started, nor right after you paused it yourself', () => {
    engine.playingFor.mockReturnValue(1000);
    mockGuard.__fire('bt', { event: 'notPlaying' });
    engine.playingFor.mockReturnValue(10000);
    engine.lastUserPause.mockReturnValue(Date.now() - 500);
    mockGuard.__fire('bt', { event: 'notPlaying' });
    expect(engine.interrupt).not.toHaveBeenCalled();
  });

  test('the speaker disconnecting also yields (the sound would jump to the phone)', () => {
    mockGuard.__fire('bt', { event: 'disconnected' });
    expect(engine.interrupt).toHaveBeenCalledWith('bluetooth');
  });
});

describe('swiping the app away', () => {
  test('stops the radio and any Zen sound', () => {
    const stopZen = jest.spyOn(ambient, 'stop').mockImplementation(() => {});
    mockGuard.__fire('task', {});
    expect(engine.pause).toHaveBeenCalled();
    expect(stopZen).toHaveBeenCalled();
    expect(mockGuard.stop).toHaveBeenCalled();
  });
});
