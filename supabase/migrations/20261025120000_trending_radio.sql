-- BOA Trending Radio: the stations BOA's admins put in "Trending on BOA
-- Radio" on Home, in order. Run once in the Supabase dashboard > SQL editor
-- (after 20261025090000_casting_board_and_admin.sql, which defines
-- public.is_admin()). One transaction; safe to run again.
--
-- Anyone can read it (Home shows it to everyone, signed in or not); only
-- admins can add, reorder or remove stations. Each row keeps the station
-- as the app knew it when picked (name, stream, logo...), so Home can play
-- it straight from here. With no rows, Home falls back to its automatic
-- Tier 1 picks.

begin;

create table if not exists public.trending_stations (
  -- The station's id in the app's catalogue (Radio Browser's uuid).
  station_id text primary key check (char_length(station_id) between 1 and 80),
  -- The station as the app plays it: { kind, id, name, streamUrl, logo, genre, ... }.
  station jsonb not null check (jsonb_typeof(station) = 'object' and station ? 'streamUrl' and station ? 'name'),
  -- Lower first.
  position integer not null default 0,
  added_by uuid default auth.uid() references auth.users (id) on delete set null,
  added_at timestamptz not null default now()
);
create index if not exists trending_stations_order_idx on public.trending_stations (position, added_at);

alter table public.trending_stations enable row level security;

drop policy if exists "read trending" on public.trending_stations;
drop policy if exists "admins add trending" on public.trending_stations;
drop policy if exists "admins reorder trending" on public.trending_stations;
drop policy if exists "admins remove trending" on public.trending_stations;

create policy "read trending" on public.trending_stations
  for select to anon, authenticated using (true);
create policy "admins add trending" on public.trending_stations
  for insert to authenticated with check (public.is_admin());
create policy "admins reorder trending" on public.trending_stations
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins remove trending" on public.trending_stations
  for delete to authenticated using (public.is_admin());

notify pgrst, 'reload schema';

commit;
