-- BOA Hype: a fire reaction on a radio station (from the car's now playing
-- screen), distinct from a favourite. Hype ranks "Trending on BOA Radio" on
-- Home. Run once in the Supabase dashboard > SQL editor. One transaction;
-- safe to run again.
--
-- Who hyped what is private: you can read only your own reactions. Everyone
-- sees the totals, through public.station_hype(). One fire per person per
-- station a day counts, so the counter can't be run up by tapping.

begin;

create table if not exists public.station_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- The station's id in the app's catalogue (Radio Browser's uuid).
  station_id text not null check (char_length(station_id) between 1 and 80),
  reaction_type text not null check (reaction_type in ('fire')),
  created_at timestamptz not null default now()
);
create index if not exists station_reactions_recent_idx on public.station_reactions (reaction_type, created_at desc);
create index if not exists station_reactions_mine_idx on public.station_reactions (user_id, station_id, reaction_type, created_at desc);

alter table public.station_reactions enable row level security;

drop policy if exists "read own reactions" on public.station_reactions;
drop policy if exists "react as yourself, once a day" on public.station_reactions;

create policy "read own reactions" on public.station_reactions
  for select to authenticated using (user_id = auth.uid());
create policy "react as yourself, once a day" on public.station_reactions
  for insert to authenticated with check (
    user_id = auth.uid()
    and not exists (
      select 1 from public.station_reactions r
      where r.user_id = auth.uid()
        and r.station_id = station_reactions.station_id
        and r.reaction_type = station_reactions.reaction_type
        and r.created_at > now() - interval '24 hours'
    )
  );
-- No update or delete policy: a fire is given, never edited or taken back.

-- The app sends only the station and the reaction: id, user_id and
-- created_at always come from the database, so a fire can't be backdated
-- past the once-a-day check.
revoke insert, update, delete on public.station_reactions from anon, authenticated;
grant insert (station_id, reaction_type) on public.station_reactions to authenticated;
grant select on public.station_reactions to authenticated;

-- Hype per station over the last `days` days (1 to 30), highest first.
-- Totals only; never who.
create or replace function public.station_hype(days integer default 7)
returns table (station_id text, hype bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.station_id, count(*)::bigint as hype
  from public.station_reactions r
  where r.reaction_type = 'fire'
    and r.created_at > now() - make_interval(days => least(greatest(station_hype.days, 1), 30))
  group by r.station_id
  order by hype desc, r.station_id
  limit 200;
$$;
revoke all on function public.station_hype(integer) from public;
grant execute on function public.station_hype(integer) to anon, authenticated;

commit;
