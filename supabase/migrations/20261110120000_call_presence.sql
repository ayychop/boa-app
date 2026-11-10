-- Which phone has your call.
--
-- Signed in on two phones, you can pick up the second one while a call is
-- live on the first, and BOA asks "Call is active on another device.
-- Transfer call to this device?". The phone that has the call writes one
-- row here and refreshes it every few seconds (src/calls/presence.js); the
-- other phone reads it. It lives in the database, not in a Realtime
-- message, because only a signed-in row can be trusted: nobody else can
-- write into your rows, so nobody can fake "your call is over here" and
-- get your phone to join a room of theirs.
--
-- A row that is not refreshed for half a minute is a call that is over
-- (a phone that died mid-call): the app ignores it.
--
-- Run in the Supabase SQL editor (or supabase db push) before installing
-- the build that uses it. Until then nothing breaks: the second phone just
-- never offers the transfer.

begin;

create table if not exists public.active_calls (
  user_id    uuid not null references auth.users (id) on delete cascade,
  device     text not null check (char_length(device) between 8 and 80),
  call_id    text not null check (call_id ~ '^[A-Za-z0-9-]{16,64}$'),
  -- The channel the call's picture and sound travel on (the call id unless
  -- the call was merged into another).
  channel    text not null check (channel ~ '^[A-Za-z0-9-]{16,64}$'),
  peer_id    uuid not null references auth.users (id) on delete cascade,
  voice      boolean not null default false,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, device)
);

alter table public.active_calls enable row level security;

drop policy if exists "active calls: read your own" on public.active_calls;
create policy "active calls: read your own" on public.active_calls
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "active calls: write your own" on public.active_calls;
create policy "active calls: write your own" on public.active_calls
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "active calls: refresh your own" on public.active_calls;
create policy "active calls: refresh your own" on public.active_calls
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "active calls: remove your own" on public.active_calls;
create policy "active calls: remove your own" on public.active_calls
  for delete to authenticated using (user_id = (select auth.uid()));

commit;
