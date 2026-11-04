-- Rate limiting for Edge Functions (supabase/functions/_shared/rateLimit.ts).
--
-- One counter per key per fixed time window, shared by every instance of a
-- function. Only the service role can touch it: the Edge Function calls
-- edge_rate_limit() with its service key, and nobody else can read the
-- counters or reset them.

create table if not exists public.edge_rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

alter table public.edge_rate_limits enable row level security;
-- No policies: with row level security on, no one but the service role gets in.
revoke all on public.edge_rate_limits from public, anon, authenticated;

-- Counts p_cost against p_key in the current window of p_window_seconds.
-- allowed is false once the window's total passes p_max; retry_after is the
-- seconds until the window ends. p_cost 0 only reads the count.
create or replace function public.edge_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_max integer,
  p_cost integer default 1
)
returns table (allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_window_seconds < 1 or p_max < 0 or p_cost < 0 or length(p_key) > 200 then
    raise exception 'bad rate limit arguments';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.edge_rate_limits as r (key, window_start, hits)
  values (p_key, v_window, p_cost)
  on conflict (key, window_start) do update set hits = r.hits + p_cost
  returning r.hits into v_hits;

  -- Old windows are dead weight; clear them out now and then.
  if random() < 0.01 then
    delete from public.edge_rate_limits where window_start < now() - interval '1 day';
  end if;

  return query select
    v_hits <= p_max,
    greatest(1, ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - now())))::integer);
end;
$$;

revoke all on function public.edge_rate_limit(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.edge_rate_limit(text, integer, integer, integer) to service_role;
