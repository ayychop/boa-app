import fs from 'fs';
import path from 'path';

// A stand-in Supabase client that records the channels the app opens.
const mockChannels = [];
const mockSupabase = {
  realtime: { setAuth: jest.fn(async () => {}) },
  getChannels: jest.fn(() => []),
  removeChannel: jest.fn(),
  channel: jest.fn((name, opts) => {
    const ch = {
      name,
      opts,
      handlers: {},
      on: jest.fn((type, { event }, fn) => {
        ch.handlers[event] = fn;
        return ch;
      }),
      subscribe: jest.fn(() => ch),
      httpSend: jest.fn(async () => ({ success: true })),
    };
    mockChannels.push(ch);
    return ch;
  }),
};
jest.mock('../src/lib/supabase', () => ({ supabase: mockSupabase, isConfigured: true }));

const signal = require('../src/calls/signaling');

beforeEach(() => {
  mockChannels.length = 0;
  jest.clearAllMocks();
});

test('your inbox is a private channel, joined only after Realtime has your session', async () => {
  const got = jest.fn();
  const stop = signal.listen('11111111-1111-4111-8111-111111111111', got);
  const inbox = mockChannels[0];
  expect(inbox.name).toBe('boa-call:11111111-1111-4111-8111-111111111111');
  expect(inbox.opts.config.private).toBe(true);
  expect(inbox.subscribe).not.toHaveBeenCalled();
  await Promise.resolve();
  await Promise.resolve();
  expect(mockSupabase.realtime.setAuth).toHaveBeenCalled();
  expect(inbox.subscribe).toHaveBeenCalled();
  inbox.handlers.ring({ payload: { callId: 'c-1' } });
  expect(got).toHaveBeenCalledWith('ring', { callId: 'c-1' });
  stop();
  expect(mockSupabase.removeChannel).toHaveBeenCalledWith(inbox);
});

test('stopping before the session is ready never joins', async () => {
  const stop = signal.listen('11111111-1111-4111-8111-111111111111', jest.fn());
  stop();
  await Promise.resolve();
  await Promise.resolve();
  expect(mockChannels[0].subscribe).not.toHaveBeenCalled();
});

test('rings go to the private inbox, with the session attached', async () => {
  const ok = await signal.send('22222222-2222-4222-8222-222222222222', 'ring', { callId: 'c-2' });
  expect(ok).toBe(true);
  const out = mockChannels[0];
  expect(out.name).toBe('boa-call:22222222-2222-4222-8222-222222222222');
  expect(out.opts.config.private).toBe(true);
  expect(mockSupabase.realtime.setAuth.mock.invocationCallOrder[0]).toBeLessThan(out.httpSend.mock.invocationCallOrder[0]);
  expect(out.httpSend).toHaveBeenCalledWith('ring', { callId: 'c-2' }, { timeout: 8000 });
});

test('a refused send (no permission) ends quietly as not sent', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockSupabase.channel.mockImplementationOnce((name, opts) => ({ name, opts, httpSend: jest.fn(async () => Promise.reject(new Error('403'))) }));
  expect(await signal.send('22222222-2222-4222-8222-222222222222', 'ring', {})).toBe(false);
  warn.mockRestore();
});

describe('private ringing policies', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261027120000_private_call_ringing.sql'), 'utf8');

  test('you only listen to your own inbox', () => {
    expect(sql).toMatch(/for select to authenticated\s+using \(\s+realtime\.messages\.extension = 'broadcast'\s+and public\.call_inbox_owner\(\(select realtime\.topic\(\)\)\) = \(select auth\.uid\(\)\)/);
  });

  test('sending needs a real inbox, an unbanned sender and no block either way', () => {
    const insert = sql.slice(sql.indexOf('for insert'));
    expect(insert).toMatch(/call_inbox_owner\(\(select realtime\.topic\(\)\)\) is not null/);
    expect(insert).toMatch(/not public\.is_banned\(\)/);
    expect(insert).toMatch(/not public\.is_blocked\(\(select auth\.uid\(\)\), public\.call_inbox_owner/);
  });

  test('inbox topics are checked before the id is cast', () => {
    expect(sql).toMatch(/when topic ~ '\^boa-call:\[0-9a-f\]\{8\}-/);
  });
});
