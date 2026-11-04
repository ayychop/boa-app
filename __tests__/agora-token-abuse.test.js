// The agora-token Edge Function is deployed without the gateway's JWT check, so
// it has to defend itself: rate limits (per address, per failed sign in, per
// account), an optional app key, and its own check of the signed-in account.
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const fn = read('supabase/functions/agora-token/index.ts');
const { clientIp, hit, memoryLimiter, safeEqual } = require('../supabase/functions/_shared/rateLimit.ts');

describe('the in memory limiter', () => {
  test('allows up to the limit in a window, then refuses with a retry time', () => {
    let t = 1_000_000;
    const m = memoryLimiter(() => t);
    for (let i = 0; i < 5; i++) expect(m.hit('k', 60, 5).allowed).toBe(true);
    const sixth = m.hit('k', 60, 5);
    expect(sixth.allowed).toBe(false);
    expect(sixth.retryAfter).toBe(60);
    t += 20_000;
    expect(m.hit('k', 60, 5).retryAfter).toBe(40);
  });

  test('a new window starts fresh, and keys do not share a count', () => {
    let t = 0;
    const m = memoryLimiter(() => t);
    for (let i = 0; i < 6; i++) m.hit('a', 60, 5);
    expect(m.hit('a', 60, 5).allowed).toBe(false);
    expect(m.hit('b', 60, 5).allowed).toBe(true);
    t += 60_000;
    expect(m.hit('a', 60, 5).allowed).toBe(true);
  });

  test('a cost of 0 only looks', () => {
    const m = memoryLimiter(() => 0);
    for (let i = 0; i < 5; i++) m.hit('k', 60, 5);
    expect(m.hit('k', 60, 5, 0).allowed).toBe(true);
    m.hit('k', 60, 5);
    expect(m.hit('k', 60, 5, 0).allowed).toBe(false);
  });

  test('old buckets are swept, so memory does not grow without end', () => {
    let t = 0;
    const m = memoryLimiter(() => t);
    for (let i = 0; i < 100; i++) m.hit(`k${i}`, 60, 5);
    expect(m.size()).toBe(100);
    t += 2 * 3_600_000;
    m.hit('fresh', 60, 5);
    expect(m.size()).toBe(1);
  });
});

describe('the shared limiter', () => {
  const memory = () => memoryLimiter(() => 0);

  test('uses the database count when it answers', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ allowed: false, retry_after: 17 }], error: null });
    const v = await hit({ rpc }, memory(), 'agora:user:1:m', 60, 8);
    expect(v).toEqual({ allowed: false, retryAfter: 17 });
    expect(rpc).toHaveBeenCalledWith('edge_rate_limit', { p_key: 'agora:user:1:m', p_window_seconds: 60, p_max: 8, p_cost: 1 });
  });

  test('when the database cannot be reached it falls back to memory, never to open', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const m = memory();
    const down = { rpc: jest.fn().mockResolvedValue({ data: null, error: { message: 'function edge_rate_limit does not exist' } }) };
    for (let i = 0; i < 3; i++) expect((await hit(down, m, 'k', 60, 3)).allowed).toBe(true);
    expect((await hit(down, m, 'k', 60, 3)).allowed).toBe(false);
    const throws = { rpc: jest.fn().mockRejectedValue(new Error('network')) };
    expect((await hit(throws, m, 'k', 60, 3)).allowed).toBe(false);
    err.mockRestore();
  });
});

describe('request checks', () => {
  const req = (headers) => ({ headers: { get: (k) => headers[k.toLowerCase()] ?? null } });

  test('the caller address comes from the platform headers, and junk is not trusted as a key', () => {
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
    expect(clientIp(req({ 'cf-connecting-ip': '2001:db8::1' }))).toBe('2001:db8::1');
    expect(clientIp(req({ 'x-forwarded-for': "'; drop table x;--" }))).toBe('unknown');
    expect(clientIp(req({}))).toBe('unknown');
  });

  test('secrets compare equal only when they are the same', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true);
    expect(safeEqual('abc123', 'abc124')).toBe(false);
    expect(safeEqual('abc', 'abc123')).toBe(false);
    expect(safeEqual('', 'abc123')).toBe(false);
  });
});

describe('the function itself', () => {
  const at = (re) => fn.search(re);

  test('every defence is there, cheapest first, and the work comes last', () => {
    const order = [
      /memory\.hit\(`agora:ip:/,
      /safeEqual\(req\.headers\.get\('x-boa-key'\)/,
      /address is locked out/,
      /unauthorized\('no Authorization header'\)/,
      /auth\.getUser\(\)/,
      /`agora:user:\$\{me\.user\.id\}:m`/,
      /`agora:user:\$\{me\.user\.id\}:h`/,
      /banned_at/,
      /RtcTokenBuilder\.buildTokenWithUid/,
    ].map(at);
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('a flood, a locked out address and an over limit account get a 429 with Retry-After', () => {
    expect(fn).toMatch(/json\(\{ error: 'Too many attempts\. Try again in a moment\.' \}, 429, \{ 'Retry-After': String\(retryAfter\) \}\)/);
    expect(fn).toMatch(/failedSignIns: \{ windowSeconds: 600, max: 8 \}/);
    expect(fn).toMatch(/userPerMinute: 8/);
    expect(fn).toMatch(/userPerHour: 40/);
  });

  test('the session is still verified in code, so no JWT at the gateway does not mean no sign in', () => {
    expect(fn).toMatch(/if \(!me\?\.user\) return unauthorized/);
    expect(fn).toMatch(/--no-verify-jwt/);
  });

  test('the app key is optional, read from a secret, and compared in constant time', () => {
    expect(fn).toMatch(/Deno\.env\.get\('AGORA_TOKEN_API_KEY'\) \?\? ''/);
    expect(fn).toMatch(/if \(API_KEY && !safeEqual/);
  });
});

describe('the rate limit table and function', () => {
  const sql = read('supabase/migrations/20261104120000_edge_rate_limits.sql');

  test('the counters are locked to the service role', () => {
    expect(sql).toMatch(/alter table public\.edge_rate_limits enable row level security/);
    expect(sql).toMatch(/revoke all on public\.edge_rate_limits from public, anon, authenticated/);
    expect(sql).toMatch(/revoke all on function public\.edge_rate_limit\(text, integer, integer, integer\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.edge_rate_limit\(text, integer, integer, integer\) to service_role/);
    expect(sql).not.toMatch(/create policy/);
  });

  test('it counts atomically in one fixed window and reports when to retry', () => {
    expect(sql).toMatch(/on conflict \(key, window_start\) do update set hits = r\.hits \+ p_cost/);
    expect(sql).toMatch(/returns table \(allowed boolean, retry_after integer\)/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path = public/);
  });
});

describe('the app', () => {
  test('sends the app key only when one is configured', () => {
    const { callHeaders } = require('../src/calls/token');
    delete process.env.EXPO_PUBLIC_BOA_CALLS_KEY;
    expect(callHeaders()).toEqual({});
    process.env.EXPO_PUBLIC_BOA_CALLS_KEY = 'k123';
    expect(callHeaders()).toEqual({ 'x-boa-key': 'k123' });
    delete process.env.EXPO_PUBLIC_BOA_CALLS_KEY;
  });

  test('the certificate and the key secret never reach the app', () => {
    const src = read('src/calls/token.js');
    expect(src).not.toMatch(/AGORA_APP_CERTIFICATE|AGORA_TOKEN_API_KEY/);
  });
});
