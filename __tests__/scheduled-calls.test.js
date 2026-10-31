import fs from 'fs';
import path from 'path';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// Links and notification taps go through openScheduledCall, which would retry
// for ten seconds with no navigation to open.
jest.mock('../src/calls/openRoom', () => ({ openScheduledCall: jest.fn(() => true) }));
jest.mock('../src/api/scheduledCalls', () => ({
  scheduleCall: jest.fn(),
  fetchRoom: jest.fn(),
  startRoom: jest.fn(() => Promise.resolve({})),
  cancelRoom: jest.fn(() => Promise.resolve({})),
  listUpcoming: jest.fn(() => Promise.resolve([])),
  subscribeRoom: jest.fn(() => jest.fn()),
  subscribeMine: jest.fn(() => jest.fn()),
}));
jest.mock('../src/api/hub', () => ({
  getProfile: jest.fn((id) => Promise.resolve({ id, display_name: id === 'host-1' ? 'Maya' : 'Jo', username: id })),
}));
jest.mock('../src/context/HubContext', () => ({ useHub: jest.fn() }));
jest.mock('../src/context/CallContext', () => ({ useCallMaybe: jest.fn() }));

const api = require('../src/api/scheduledCalls');
const { useHub } = require('../src/context/HubContext');
const { useCallMaybe } = require('../src/context/CallContext');
const { openScheduledCall } = require('../src/calls/openRoom');
const schedule = require('../src/calls/schedule');
const reminders = require('../src/calls/reminders');

const ROOM = '3f0c9a52-7d1e-4b8a-9c36-0e5d2b7a41f8';
const MIN = 60 * 1000;
const row = (over = {}) => ({
  id: 'row-1',
  host_id: 'host-1',
  participant_id: 'guest-1',
  room_id: ROOM,
  scheduled_time: new Date(Date.now() + 2 * 60 * MIN + 30 * 1000).toISOString(),
  status: 'pending',
  created_at: new Date().toISOString(),
  ...over,
});

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  Notifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
});

describe('the link', () => {
  test('boahub://call/<room> and network.boa://call/<room> open a room', () => {
    expect(schedule.parseRoomLink(`boahub://call/${ROOM}`)).toBe(ROOM);
    expect(schedule.parseRoomLink(`boahub://call/${ROOM}/`)).toBe(ROOM);
    expect(schedule.parseRoomLink(`BOAHUB://call/${ROOM}?utm=x#top`)).toBe(ROOM);
    expect(schedule.parseRoomLink(`network.boa://call/${ROOM}`)).toBe(ROOM);
    expect(schedule.roomLink(ROOM)).toBe(`boahub://call/${ROOM}`);
  });

  test('a ring link, a short id and other pages are not room links', () => {
    expect(schedule.parseRoomLink(`network.boa://call/${ROOM}?from=abc`)).toBeNull();
    expect(schedule.parseRoomLink('boahub://call/short')).toBeNull();
    expect(schedule.parseRoomLink('boahub://weather')).toBeNull();
    expect(schedule.parseRoomLink(`https://boa.network/call/${ROOM}`)).toBeNull();
    expect(schedule.parseRoomLink(null)).toBeNull();
  });

  test('a chat message carrying a link is found, and shown without it', () => {
    const body = `📅 Video call · Today, 8:30 PM\nboahub://call/${ROOM}`;
    expect(schedule.roomIdIn(body)).toBe(ROOM);
    expect(schedule.withoutRoomLink(body)).toBe('📅 Video call · Today, 8:30 PM');
    expect(schedule.roomIdIn('see you at 8')).toBeNull();
  });

  test('routeLink sends a room link to the countdown, and still leaves a ring link alone', () => {
    jest.isolateModules(() => {
      // Only the routing function: the whole App is not needed to read it.
      const src = read('App.js');
      expect(src).toMatch(/const room = parseRoomLink\(url\);\s*if \(room\) \{\s*openScheduledCall\(room\);\s*return true;/);
      // The room check comes before the network.boa target switch.
      expect(src.indexOf('parseRoomLink(url)')).toBeLessThan(src.indexOf("const target = m?.[1]"));
    });
  });

  test('the app answers to boahub:// (app.json) and has the countdown screen', () => {
    expect(JSON.parse(read('app.json')).expo.scheme).toEqual(['network.boa', 'boahub']);
    const app = read('App.js');
    expect(app).toMatch(/<Stack\.Screen name="ScheduledCall" component=\{ScheduledCallScreen\}/);
    expect(app).toMatch(/<ScheduledCallSync \/>/);
  });
});

describe('the countdown numbers', () => {
  test('rounds up to whole seconds, never zero early', () => {
    expect(schedule.countdownParts(0).done).toBe(true);
    expect(schedule.countdownParts(-5000).done).toBe(true);
    const p = schedule.countdownParts(1);
    expect(p.done).toBe(false);
    expect(p.seconds).toBe(1);
  });

  test('hours, minutes and seconds; days only when there are some', () => {
    const p = schedule.countdownParts((3 * 3600 + 5 * 60 + 9) * 1000);
    expect(p.units.map((u) => u.id)).toEqual(['hours', 'minutes', 'seconds']);
    expect(p.units.map((u) => u.value)).toEqual(['03', '05', '09']);
    const d = schedule.countdownParts((2 * 86400 + 60) * 1000);
    expect(d.units.map((u) => u.id)).toEqual(['days', 'hours', 'minutes', 'seconds']);
    expect(d.units[0].value).toBe('02');
  });

  test('speaks it for a screen reader', () => {
    expect(schedule.spokenCountdown(0)).toBe('now');
    expect(schedule.spokenCountdown((2 * 3600 + 5 * 60) * 1000)).toBe('in 2 hours 5 min');
    expect(schedule.spokenCountdown(45 * 1000)).toBe('in 45 sec');
  });
});

describe('the reminder time', () => {
  const now = Date.UTC(2026, 9, 31, 12, 0, 0);
  test('ten minutes before', () => {
    expect(schedule.reminderAt(now + 60 * MIN, now)).toBe(now + 50 * MIN);
  });
  test('a call under ten minutes away gets one a few seconds from now', () => {
    expect(schedule.reminderAt(now + 4 * MIN, now)).toBe(now + 5000);
  });
  test('a call that is here, or past, gets none', () => {
    expect(schedule.reminderAt(now + 30 * 1000, now)).toBeNull();
    expect(schedule.reminderAt(now - MIN, now)).toBeNull();
    expect(schedule.reminderAt(NaN, now)).toBeNull();
  });
});

describe('picking a time', () => {
  test('the default is the next quarter hour, at least 15 minutes out', () => {
    for (const offset of [0, 7 * MIN, 14 * MIN + 59000, 31 * MIN]) {
      const now = Date.UTC(2026, 9, 31, 12, 0, 0) + offset;
      const s = schedule.defaultSlot(now);
      const at = schedule.atTime(s.day, s.hour, s.minute);
      expect(at - now).toBeGreaterThanOrEqual(15 * MIN - 59000);
      expect(at - now).toBeLessThanOrEqual(30 * MIN);
      expect(s.minute % 15).toBe(0);
    }
  });

  test('the quick picks are only ones still ahead, and a day later is always there', () => {
    const late = new Date(2026, 9, 31, 22, 30).getTime();
    const ids = schedule.quickSlots(late).map((q) => q.id);
    expect(ids).toEqual(expect.arrayContaining(['15m', '1h', 'tomorrow']));
    expect(ids).not.toContain('tonight');
    const early = new Date(2026, 9, 31, 9, 0).getTime();
    expect(schedule.quickSlots(early).map((q) => q.id)).toContain('tonight');
  });

  test('seven days from today, named', () => {
    const days = schedule.dayOptions(new Date(2026, 9, 31, 12).getTime());
    expect(days).toHaveLength(7);
    expect(days.slice(0, 3).map((d) => d.label)).toEqual(['Today', 'Tomorrow', 'Mon 2']);
  });

  test('says when', () => {
    const now = new Date(2026, 9, 31, 12, 0).getTime();
    expect(schedule.formatWhen(new Date(2026, 9, 31, 20, 30).getTime(), now)).toBe('Today, 8:30 PM');
    expect(schedule.formatWhen(new Date(2026, 10, 1, 9, 0).getTime(), now)).toBe('Tomorrow, 9:00 AM');
    expect(schedule.formatWhen(new Date(2026, 10, 4, 0, 5).getTime(), now)).toBe('Wed 4 Nov, 12:05 AM');
    expect(schedule.longDate(new Date(2026, 9, 31).getTime())).toBe('Saturday 31 October');
  });

  test('a time under a minute away cannot be scheduled', () => {
    const now = Date.now();
    expect(schedule.isSchedulable(now + 30 * 1000, now)).toBe(false);
    expect(schedule.isSchedulable(now + 2 * MIN, now)).toBe(true);
  });

  test('new room ids are UUIDs the token function accepts', () => {
    expect(schedule.newRoomId({ randomUUID: () => ROOM })).toBe(ROOM);
    const made = schedule.newRoomId(null);
    expect(made).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(made).toMatch(/^[A-Za-z0-9-]{16,64}$/);
  });
});

describe('local reminders', () => {
  test('one is scheduled ten minutes before, on its own channel, tagged for the tap', async () => {
    const when = Date.now() + 60 * MIN;
    const res = await reminders.remindForRow(row({ scheduled_time: new Date(when).toISOString() }), 'Maya');
    expect(res.at).toBe(when - 10 * MIN);
    const call = Notifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(call.trigger.type).toBe('date');
    expect(call.trigger.date.getTime()).toBe(when - 10 * MIN);
    expect(call.trigger.channelId).toBe('boa-reminders');
    expect(call.content.title).toBe('Call with Maya in 10 minutes');
    expect(call.content.data).toMatchObject({ type: 'call-reminder', roomId: ROOM });
  });

  test('the same reminder twice is not scheduled twice; a new time replaces it', async () => {
    const when = Date.now() + 60 * MIN;
    const r = row({ scheduled_time: new Date(when).toISOString() });
    await reminders.remindForRow(r, 'Maya');
    const again = await reminders.remindForRow(r, 'Maya');
    expect(again.kept).toBe(true);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    await reminders.remindForRow(row({ scheduled_time: new Date(when + 30 * MIN).toISOString() }), 'Maya');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-id');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  test('cancelling forgets it', async () => {
    await reminders.remindForRow(row({ scheduled_time: new Date(Date.now() + 60 * MIN).toISOString() }), 'Maya');
    expect(await reminders.cancelReminder(ROOM)).toBe(true);
    expect(await reminders.savedReminders()).toEqual({});
    expect(await reminders.cancelReminder(ROOM)).toBe(false);
  });

  test('a call that is about to start, or notifications being off, say so instead of scheduling', async () => {
    expect(await reminders.remindForRow(row({ scheduled_time: new Date(Date.now() + 20 * 1000).toISOString() }))).toEqual({ reason: 'too-soon' });
    Notifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    expect(await reminders.remindForRow(row({ scheduled_time: new Date(Date.now() + 60 * MIN).toISOString() }))).toEqual({ reason: 'denied' });
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('a background sync never asks for permission', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    await reminders.syncCallReminders([row({ scheduled_time: new Date(Date.now() + 60 * MIN).toISOString() })]);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('sync sets reminders for pending calls, drops ones that started or vanished, and leaves plain reminders', async () => {
    const t = (m) => new Date(Date.now() + m * MIN).toISOString();
    const a = row({ room_id: 'aaaaaaaa-0000-4000-8000-000000000001', scheduled_time: t(60) });
    const b = row({ room_id: 'bbbbbbbb-0000-4000-8000-000000000002', scheduled_time: t(90) });
    await reminders.syncCallReminders([a, b], { nameOf: () => 'Maya' });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    await reminders.remindToCall({ key: `${reminders.PLAIN_PREFIX}x`, when: Date.now() + 120 * MIN, name: 'Maya', conversationId: 'c1' });
    // b starts; a is gone from the list.
    await reminders.syncCallReminders([{ ...b, status: 'active' }]);
    const left = Object.keys(await reminders.savedReminders());
    expect(left).toEqual([`${reminders.PLAIN_PREFIX}x`]);
  });

  test('a reminder pops up with the app open', () => {
    expect(read('src/chat/notifications.js')).toMatch(/data\.type === 'call-reminder'/);
  });
});

describe('the scheduled_calls API', () => {
  // A private copy of the module per test, so the rest of the file keeps its React.
  const load = (client) => {
    let mod;
    jest.isolateModules(() => {
      jest.doMock('../src/lib/supabase', () => ({ supabase: client, isConfigured: true }));
      mod = jest.requireActual('../src/api/scheduledCalls');
    });
    return mod;
  };
  const chain = (result) => {
    const q = {};
    for (const m of ['select', 'insert', 'update', 'eq', 'or', 'gte', 'order', 'limit']) q[m] = jest.fn(() => q);
    q.single = jest.fn(() => Promise.resolve(result));
    q.maybeSingle = jest.fn(() => Promise.resolve(result));
    q.then = (res, rej) => Promise.resolve(result).then(res, rej);
    return q;
  };

  test('scheduling inserts a pending row with the room id and an ISO time', async () => {
    const q = chain({ data: { id: 'r1' }, error: null });
    const real = load({ from: jest.fn(() => q) });
    const when = Date.UTC(2026, 10, 1, 20, 30);
    await real.scheduleCall({ hostId: 'h', participantId: 'p', roomId: ROOM, when });
    expect(q.insert).toHaveBeenCalledWith({ host_id: 'h', participant_id: 'p', room_id: ROOM, scheduled_time: '2026-11-01T20:30:00.000Z', status: 'pending' });
  });

  test('starting only turns a pending row active', async () => {
    const q = chain({ data: { status: 'active' }, error: null });
    const real = load({ from: jest.fn(() => q) });
    await real.startRoom(ROOM);
    expect(q.update).toHaveBeenCalledWith({ status: 'active' });
    expect(q.eq).toHaveBeenCalledWith('room_id', ROOM);
    expect(q.eq).toHaveBeenCalledWith('status', 'pending');
  });

  test('an error comes back as a message', async () => {
    const real = load({ from: jest.fn(() => chain({ data: null, error: { message: 'permission denied' } })) });
    await expect(real.fetchRoom(ROOM)).rejects.toThrow('permission denied');
  });

  test('the room listener is a postgres_changes channel filtered on the room, and it can be stopped', () => {
    let handler;
    const channel = { on: jest.fn((type, filter, fn) => { handler = fn; return channel; }), subscribe: jest.fn((cb) => { cb('SUBSCRIBED'); return channel; }) };
    const client = { channel: jest.fn(() => channel), removeChannel: jest.fn() };
    const real = load(client);
    const onRow = jest.fn();
    const onStatus = jest.fn();
    const stop = real.subscribeRoom(ROOM, onRow, onStatus);
    expect(channel.on).toHaveBeenCalledWith('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_calls', filter: `room_id=eq.${ROOM}` }, expect.any(Function));
    expect(onStatus).toHaveBeenCalledWith('SUBSCRIBED');
    handler({ eventType: 'UPDATE', new: { status: 'active' } });
    expect(onRow).toHaveBeenCalledWith({ status: 'active' });
    handler({ eventType: 'DELETE', old: {} });
    expect(onRow).toHaveBeenLastCalledWith(null);
    stop();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });

  test('with no Supabase project it does nothing rather than crash', () => {
    const real = load(null);
    expect(real.subscribeRoom(ROOM, jest.fn())()).toBeUndefined();
    expect(real.scheduleCall({ hostId: 'h', participantId: 'p', roomId: ROOM, when: Date.now() })).rejects.toThrow(/not set up/);
  });
});

describe('the countdown screen', () => {
  const Screen = require('../src/screens/ScheduledCallScreen').default;
  const nav = () => ({ goBack: jest.fn(), canGoBack: () => true, navigate: jest.fn() });
  const calls = (over = {}) => ({ joinRoom: jest.fn(() => true), startCall: jest.fn(), ...over });
  const mount = async (n = nav()) => {
    await render(<Screen navigation={n} route={{ params: { roomId: ROOM } }} />);
    await act(async () => {});
    return n;
  };
  const room = (r) => api.fetchRoom.mockResolvedValue(r);
  const asGuest = (c = calls()) => {
    useHub.mockReturnValue({ userId: 'guest-1', stage: 'ready' });
    useCallMaybe.mockReturnValue(c);
    return c;
  };
  const asHost = (c = calls()) => {
    useHub.mockReturnValue({ userId: 'host-1', stage: 'ready' });
    useCallMaybe.mockReturnValue(c);
    return c;
  };

  test('Scenario A: pending shows the live countdown, who is on it, and does not join', async () => {
    const c = asGuest();
    room(row());
    await mount();
    expect(screen.getByTestId('room-pending')).toBeTruthy();
    expect(screen.getByTestId('countdown-hours')).toHaveTextContent(/^02/);
    expect(screen.getByTestId('countdown-minutes')).toHaveTextContent(/^(59|00)/);
    expect(screen.getByTestId('countdown-seconds')).toBeTruthy();
    expect(screen.queryByTestId('countdown-days')).toBeNull();
    expect(screen.getByText('Call with Maya')).toBeTruthy();
    expect(screen.getByTestId('call-pair')).toBeTruthy();
    expect(c.joinRoom).not.toHaveBeenCalled();
  });

  test('the countdown ticks by itself', async () => {
    jest.useFakeTimers({ now: Date.now() });
    try {
      asGuest();
      room(row({ scheduled_time: new Date(Date.now() + 5 * MIN + 500).toISOString() }));
      await mount();
      expect(screen.getByTestId('countdown-minutes')).toHaveTextContent(/^05/);
      await act(async () => { jest.advanceTimersByTime(2 * MIN); });
      expect(screen.getByTestId('countdown-minutes')).toHaveTextContent(/^03/);
    } finally {
      jest.useRealTimers();
    }
  });

  test('days appear for a call days away', async () => {
    asGuest();
    room(row({ scheduled_time: new Date(Date.now() + 3 * 86400 * 1000 + 5000).toISOString() }));
    await mount();
    expect(screen.getByTestId('countdown-days')).toHaveTextContent(/^03/);
  });

  test('Scenario B: a call that is already active joins at once and closes the countdown', async () => {
    const c = asGuest();
    room(row({ status: 'active' }));
    const n = await mount();
    expect(c.joinRoom).toHaveBeenCalledTimes(1);
    expect(c.joinRoom).toHaveBeenCalledWith(ROOM, expect.objectContaining({ id: 'host-1' }));
    expect(n.goBack).toHaveBeenCalled();
  });

  test('the live change: pending turning active takes the guest into the call, once', async () => {
    const c = asGuest();
    room(row());
    const n = await mount();
    expect(c.joinRoom).not.toHaveBeenCalled();
    // The Realtime listener was opened on this room.
    expect(api.subscribeRoom).toHaveBeenCalledWith(ROOM, expect.any(Function), expect.any(Function));
    const push = api.subscribeRoom.mock.calls[0][1];
    await act(async () => push(row({ status: 'active' })));
    expect(c.joinRoom).toHaveBeenCalledTimes(1);
    expect(n.goBack).toHaveBeenCalledTimes(1);
    await act(async () => push(row({ status: 'active' })));
    expect(c.joinRoom).toHaveBeenCalledTimes(1);
  });

  test('another call in progress: it says so and stays', async () => {
    const c = asGuest(calls({ joinRoom: jest.fn(() => false) }));
    room(row({ status: 'active' }));
    const n = await mount();
    expect(c.joinRoom).toHaveBeenCalled();
    expect(screen.getByTestId('room-problem')).toBeTruthy();
    expect(n.goBack).not.toHaveBeenCalled();
    expect(screen.getByTestId('room-join')).toBeTruthy();
  });

  test('the host is never joined as a guest; the host starts it, then the room turns active', async () => {
    const c = asHost();
    room(row({ scheduled_time: new Date(Date.now() - MIN).toISOString() }));
    const n = await mount();
    expect(c.joinRoom).not.toHaveBeenCalled();
    expect(screen.getByTestId('call-waiting')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('room-start'));
    expect(c.startCall).toHaveBeenCalledWith(expect.objectContaining({ id: 'guest-1' }), expect.objectContaining({ roomId: ROOM, onStarted: expect.any(Function) }));
    expect(api.startRoom).not.toHaveBeenCalled();
    await act(async () => c.startCall.mock.calls[0][1].onStarted(ROOM));
    expect(api.startRoom).toHaveBeenCalledWith(ROOM);
    expect(n.goBack).toHaveBeenCalled();
  });

  test('the host can start before the time, and cancel', async () => {
    asHost();
    room(row());
    await mount();
    expect(screen.getByTestId('room-start')).toHaveTextContent(/Start early/);
    expect(screen.getByTestId('room-cancel')).toBeTruthy();
  });

  test('Remind me sets the local reminder ten minutes before, and again cancels it', async () => {
    asGuest();
    const when = Date.now() + 2 * 60 * MIN;
    room(row({ scheduled_time: new Date(when).toISOString() }));
    await mount();
    await fireEvent.press(screen.getByTestId('room-remind'));
    await act(async () => {});
    const sent = Notifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(sent.trigger.date.getTime()).toBe(when - 10 * MIN);
    expect(screen.getByTestId('room-remind')).toHaveTextContent(/Reminder set/);
    await fireEvent.press(screen.getByTestId('room-remind'));
    await act(async () => {});
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalled();
    expect(screen.getByTestId('room-remind')).toHaveTextContent(/Remind me 10 min before/);
  });

  test('no such call, and a finished one, have their own pages', async () => {
    asGuest();
    room(null);
    await mount();
    expect(screen.getByTestId('room-missing')).toBeTruthy();
  });

  test('a cancelled call is over', async () => {
    asGuest();
    room(row({ status: 'cancelled' }));
    await mount();
    expect(screen.getByTestId('room-over')).toBeTruthy();
  });

  test('signed out: asks to sign in, and loads nothing', async () => {
    useHub.mockReturnValue({ userId: null, stage: 'signedOut' });
    useCallMaybe.mockReturnValue(calls());
    const n = await mount();
    expect(screen.getByTestId('room-signed-out')).toBeTruthy();
    expect(api.fetchRoom).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('room-sign-in'));
    expect(n.navigate).toHaveBeenCalledWith('HubWelcome', { next: 'back' });
  });

  test('a load that fails can be retried', async () => {
    asGuest();
    api.fetchRoom.mockRejectedValueOnce(new Error('offline'));
    await mount();
    expect(screen.getByTestId('room-error')).toBeTruthy();
    room(row());
    await fireEvent.press(screen.getByTestId('room-retry'));
    await act(async () => {});
    expect(screen.getByTestId('room-pending')).toBeTruthy();
  });

  test('premium styling: the BOA mark, big light numerals, gold; motion follows Reduce Motion', () => {
    const src = read('src/screens/ScheduledCallScreen.js');
    expect(src).toMatch(/<BoaLogo height=\{26\} sheen \/>/);
    expect(src).toMatch(/fonts\.extralight/);
    expect(src).toMatch(/FadeInDown/);
    expect(src).toMatch(/useReducedMotion/);
    expect(src).toMatch(/animate = settled && !still/);
  });
});

describe('joining a room in the call model', () => {
  const src = read('src/context/CallContext.js');

  test('startCall takes the room id as the call id, and tells the caller once it is on', () => {
    expect(src).toMatch(/\(person, \{ voice = false, roomId = null, onStarted = null \} = \{\}\)/);
    expect(src).toMatch(/const id = roomId \?\? ahead\?\.id \?\? newId\(\)/);
    expect(src).toMatch(/onStarted\?\.\(id\)/);
  });

  test('joinRoom goes straight to the call, tells the host, and is offered to screens', () => {
    expect(src).toMatch(/const joinRoom = useCallback/);
    expect(src).toMatch(/signal\.send\(peer\.id, 'accept', \{ callId: roomId, by: userId \}\)/);
    expect(src).toMatch(/seen\.current\.add\(roomId\)/);
    expect(src.match(/^\s+joinRoom,$/gm)).toHaveLength(2);
  });
});

describe('scheduling from the chat', () => {
  const Sheet = require('../src/components/chat/ScheduleSheet').default;
  const person = { id: 'guest-1', display_name: 'Jo' };
  const mount = async (props = {}) => {
    const onSend = jest.fn(() => Promise.resolve());
    await render(<Sheet open onClose={jest.fn()} userId="host-1" person={person} conversationId="conv-1" onSend={onSend} {...props} />);
    await act(async () => {});
    return { onSend, onClose: props.onClose };
  };

  test('the chat has the calendar button and the sheet, with both choices', () => {
    const chat = read('src/screens/hub/NewChatScreen.js');
    expect(chat).toMatch(/testID="thread-schedule"/);
    expect(chat).toMatch(/<ScheduleSheet/);
    const sheet = read('src/components/chat/ScheduleSheet.js');
    expect(sheet).toMatch(/Schedule Call/);
    expect(sheet).toMatch(/Set Reminder/);
  });

  test('Schedule Call saves the row, sets the reminder, and puts the link in the chat', async () => {
    api.scheduleCall.mockImplementation(async ({ hostId, participantId, roomId, when }) => row({ host_id: hostId, participant_id: participantId, room_id: roomId, scheduled_time: new Date(when).toISOString() }));
    const { onSend } = await mount();
    await fireEvent.press(screen.getByTestId('schedule-submit'));
    await act(async () => {});
    expect(api.scheduleCall).toHaveBeenCalledTimes(1);
    const arg = api.scheduleCall.mock.calls[0][0];
    expect(arg).toMatchObject({ hostId: 'host-1', participantId: 'guest-1' });
    expect(arg.roomId).toMatch(/^[A-Za-z0-9-]{16,64}$/);
    expect(arg.when - Date.now()).toBeGreaterThan(14 * MIN);
    // The link, in the chat, as the message the other phone turns into a card.
    const text = onSend.mock.calls[0][0];
    expect(schedule.roomIdIn(text)).toBe(arg.roomId);
    // The reminder, ten minutes before.
    expect(Notifications.scheduleNotificationAsync.mock.calls[0][0].trigger.date.getTime()).toBe(arg.when - 10 * MIN);
    expect(screen.getByTestId('schedule-done')).toBeTruthy();
    expect(screen.getByText('Call scheduled')).toBeTruthy();
  });

  test('Set Reminder only sets the local reminder: nothing saved, nothing sent', async () => {
    const { onSend } = await mount();
    await fireEvent.press(screen.getByTestId('set-reminder-button'));
    await fireEvent.press(screen.getByTestId('schedule-submit'));
    await act(async () => {});
    expect(api.scheduleCall).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
    const sent = Notifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(sent.content.data).toMatchObject({ type: 'call-reminder', conversationId: 'conv-1' });
    expect(screen.getByText('Reminder set')).toBeTruthy();
  });

  test('a failed save is shown, and nothing is sent or reminded', async () => {
    api.scheduleCall.mockRejectedValue(new Error('permission denied'));
    const { onSend } = await mount();
    await fireEvent.press(screen.getByTestId('schedule-submit'));
    await act(async () => {});
    expect(screen.getByTestId('schedule-error')).toHaveTextContent('permission denied');
    expect(onSend).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('a link that could not be posted does not undo a saved call', async () => {
    api.scheduleCall.mockImplementation(async (a) => row({ room_id: a.roomId, scheduled_time: new Date(a.when).toISOString() }));
    const onSend = jest.fn(() => Promise.reject(new Error('offline')));
    await mount({ onSend });
    await fireEvent.press(screen.getByTestId('schedule-submit'));
    await act(async () => {});
    expect(screen.getByTestId('schedule-done')).toBeTruthy();
  });

  test('a message with a room link is drawn as a card that opens the countdown', async () => {
    const CallInvite = require('../src/components/chat/CallInvite').default;
    const vibe = { mineText: '#fff', theirsText: '#fff' };
    await render(<CallInvite roomId={ROOM} text="📅 Video call · Today, 8:30 PM" mine={false} vibe={vibe} />);
    expect(screen.getByText('📅 Video call · Today, 8:30 PM')).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`call-invite-${ROOM}`));
    expect(openScheduledCall).toHaveBeenCalledWith(ROOM);
    const chat = read('src/screens/hub/NewChatScreen.js');
    expect(chat).toMatch(/roomIdIn\(message\.body\)/);
    expect(chat).toMatch(/<CallInvite roomId=\{invite\}/);
  });
});

describe('tapping a reminder', () => {
  const { openFromReminder } = require('../src/components/ScheduledCallSync');
  const tap = (data, id) => ({ notification: { date: Date.now(), request: { identifier: id, content: { data } } } });

  test('a call reminder opens its countdown, once', () => {
    expect(openFromReminder(tap({ type: 'call-reminder', roomId: ROOM }, 'n1'))).toBe(true);
    expect(openScheduledCall).toHaveBeenCalledWith(ROOM);
    const r = tap({ type: 'call-reminder', roomId: ROOM }, 'n2');
    openFromReminder(r);
    openFromReminder(r);
    expect(openScheduledCall).toHaveBeenCalledTimes(2);
  });

  test('anything else is not ours', () => {
    expect(openFromReminder(tap({ type: 'chat', conversationId: 'c' }, 'n3'))).toBe(false);
    expect(openScheduledCall).not.toHaveBeenCalledWith(undefined);
  });
});

