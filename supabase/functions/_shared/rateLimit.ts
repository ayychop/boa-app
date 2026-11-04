// Rate limiting and small request checks shared by the Edge Functions.
//
// Two limiters, used together:
//
//   memoryLimiter  a fixed window kept in this isolate. Free and instant, so
//                  it sheds a flood before anything else runs. It only sees the
//                  requests that reached this instance, so it is a first gate,
//                  not the whole defence.
//   the database   public.edge_rate_limit (supabase/migrations/
//                  20261104120000_edge_rate_limits.sql), one counter for every
//                  instance. This is the limit that holds.
//
// `hit` asks the database and, if the database cannot be reached (the
// migration not applied yet, an outage), falls back to the memory limiter
// instead of letting requests through unchecked.

export type Verdict = { allowed: boolean; retryAfter: number };

type Bucket = { start: number; hits: number };

/** A fixed-window counter in memory. `now` is injectable for tests. */
export function memoryLimiter(now: () => number = Date.now) {
  const buckets = new Map<string, Bucket>();
  let sweptAt = 0;
  return {
    hit(key: string, windowSeconds: number, max: number, cost = 1): Verdict {
      const t = now();
      const windowMs = windowSeconds * 1000;
      // Forget the buckets that have run out, at most once a minute.
      if (t - sweptAt > 60_000) {
        sweptAt = t;
        for (const [k, b] of buckets) if (t - b.start > 3_600_000) buckets.delete(k);
      }
      let b = buckets.get(key);
      if (!b || t - b.start >= windowMs) {
        b = { start: t, hits: 0 };
        buckets.set(key, b);
      }
      b.hits += cost;
      return { allowed: b.hits <= max, retryAfter: Math.max(1, Math.ceil((b.start + windowMs - t) / 1000)) };
    },
    size: () => buckets.size,
  };
}

// deno-lint-ignore no-explicit-any
type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }> };

/**
 * One hit on `key`: at most `max` per `windowSeconds`, counted across every
 * instance. `cost` 0 only looks at the count (used to refuse a caller that
 * has already failed too often, before spending work on them).
 */
export async function hit(db: Rpc, memory: ReturnType<typeof memoryLimiter>, key: string, windowSeconds: number, max: number, cost = 1): Promise<Verdict> {
  try {
    const { data, error } = await db.rpc('edge_rate_limit', { p_key: key, p_window_seconds: windowSeconds, p_max: max, p_cost: cost });
    const row = Array.isArray(data) ? data[0] : data;
    if (!error && row && typeof row.allowed === 'boolean') {
      return { allowed: row.allowed, retryAfter: Math.max(1, Number(row.retry_after) || windowSeconds) };
    }
    console.error('[rate-limit] database limiter unavailable, using memory', error?.message ?? 'no row');
  } catch (err) {
    console.error('[rate-limit] database limiter threw, using memory', String(err));
  }
  return memory.hit(key, windowSeconds, max, cost);
}

/** The caller's address as the platform saw it (the left-most forwarded entry). */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for') ?? '';
  const first = forwarded.split(',')[0].trim();
  // Anything that is not an address is bucketed together, never trusted as a key.
  return /^[0-9a-fA-F:.]{3,45}$/.test(first) ? first : 'unknown';
}

/** Compares two secrets without stopping at the first different character. */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
