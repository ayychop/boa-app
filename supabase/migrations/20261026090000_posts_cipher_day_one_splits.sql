-- BOA HUB: profile posts, The Cipher (live rooms), Day One badges, and
-- Splits (split sheets and invoices).
--
-- Run once in the Supabase dashboard > SQL editor, after
-- 20261025200000_now_playing_zen.sql. One transaction: if any statement
-- fails, nothing changes. Safe to run again. Until it's run, the app shows
-- these sections empty with a "the Hub's database isn't up to date" note;
-- nothing else breaks.
--
--  1. posts: photos and videos on your Hub profile (the posts bucket,
--     public, your own folder only). You see a post when you can see its
--     author's profile (so blocks, bans and hidden profiles apply), and
--     people can be tagged in it.
--  2. live_sessions and session_participants: The Cipher's audio rooms.
--     Free to join. A host opens a room; anyone signed in can listen, raise
--     a hand, and take the mic once the host brings them up. Only the host
--     changes roles or ends the room.
--  3. day_one_claims: the first time you play a station or watch a BOA
--     Original, with your place in the queue. The first 1,000 people for
--     each one are its Day Ones (claim_day_one stamps the place, so nobody
--     can pick their own).
--  4. split_sheets, split_parties and invoices: two or more creators agree
--     who owns what share of a work; once every party has agreed (and the
--     shares come to 100%) the sheet is signed and can't change. Invoices
--     are the issuer's, readable by the Hub member they're addressed to.

begin;

-- ------------------------------------------------------------------- posts
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('image', 'video')),
  media_path text not null check (char_length(media_path) <= 300),
  media_url text not null check (char_length(media_url) <= 600),
  media_width int,
  media_height int,
  media_duration_ms int,
  caption text not null default '' check (char_length(caption) <= 2200),
  -- Hub members tagged in it (up to 20).
  tagged uuid[] not null default '{}' check (cardinality(tagged) <= 20),
  created_at timestamptz not null default now()
);
create index if not exists posts_author_idx on public.posts (author_id, created_at desc);
create index if not exists posts_tagged_idx on public.posts using gin (tagged);
alter table public.posts enable row level security;

drop policy if exists "read posts of visible profiles" on public.posts;
drop policy if exists "post as yourself" on public.posts;
drop policy if exists "edit own posts" on public.posts;
drop policy if exists "delete own posts" on public.posts;
-- The profiles subquery runs under the reader's own profile policies.
create policy "read posts of visible profiles" on public.posts
  for select to authenticated using (
    author_id = (select auth.uid())
    or exists (select 1 from public.profiles p where p.id = author_id)
  );
create policy "post as yourself" on public.posts
  for insert to authenticated with check (author_id = (select auth.uid()) and not public.is_banned());
create policy "edit own posts" on public.posts
  for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "delete own posts" on public.posts
  for delete to authenticated using (author_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'posts', 'posts', true, 67108864,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime', 'video/3gpp', 'video/webm']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "post media upload own folder" on storage.objects;
drop policy if exists "post media delete own" on storage.objects;
create policy "post media upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'posts' and (storage.foldername(name))[1] = (select auth.uid())::text and not public.is_banned());
create policy "post media delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'posts' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- -------------------------------------------------------------- The Cipher
create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 80),
  kind text not null default 'listening_party'
    check (kind in ('listening_party', 'freestyle', 'jam', 'premiere', 'talk')),
  description text not null default '' check (char_length(description) <= 500),
  -- What the host is spinning right now ("Unreleased: Night Bus (demo)").
  now_playing text check (char_length(now_playing) <= 120),
  status text not null default 'live' check (status in ('live', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists live_sessions_live_idx on public.live_sessions (started_at desc) where status = 'live';
alter table public.live_sessions enable row level security;

create table if not exists public.session_participants (
  session_id uuid not null references public.live_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'listener' check (role in ('host', 'speaker', 'listener')),
  hand_raised boolean not null default false,
  muted boolean not null default true,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (session_id, user_id)
);
create index if not exists session_participants_live_idx on public.session_participants (session_id) where left_at is null;
alter table public.session_participants enable row level security;

create or replace function public.hosts_session(s uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.live_sessions where id = s and host_id = (select auth.uid()));
$$;

drop policy if exists "read live rooms" on public.live_sessions;
drop policy if exists "open a room" on public.live_sessions;
drop policy if exists "host runs the room" on public.live_sessions;
create policy "read live rooms" on public.live_sessions
  for select to authenticated using (
    host_id = (select auth.uid())
    or exists (select 1 from public.profiles p where p.id = host_id)
  );
create policy "open a room" on public.live_sessions
  for insert to authenticated with check (host_id = (select auth.uid()) and status = 'live' and not public.is_banned());
create policy "host runs the room" on public.live_sessions
  for update to authenticated using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));

drop policy if exists "read who is in a room" on public.session_participants;
drop policy if exists "join a room" on public.session_participants;
drop policy if exists "update your seat or run the stage" on public.session_participants;
create policy "read who is in a room" on public.session_participants
  for select to authenticated using (true);
create policy "join a room" on public.session_participants
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and not public.is_banned()
    and exists (select 1 from public.live_sessions s where s.id = session_id and s.status = 'live')
  );
create policy "update your seat or run the stage" on public.session_participants
  for update to authenticated
  using (user_id = (select auth.uid()) or public.hosts_session(session_id))
  with check (user_id = (select auth.uid()) or public.hosts_session(session_id));

-- Only the host hands out the mic: anyone else's own changes keep their
-- role (you can step down to listener, never up), and you join as a
-- listener unless it's your room.
create or replace function public.session_participants_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  is_host boolean;
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  select exists (select 1 from public.live_sessions where id = new.session_id and host_id = (select auth.uid())) into is_host;
  if tg_op = 'INSERT' then
    if is_host and new.user_id = (select auth.uid()) then
      new.role := 'host';
    else
      new.role := 'listener';
    end if;
  elsif not is_host then
    if not (old.role in ('host', 'speaker') and new.role = 'listener') then
      new.role := old.role;
    end if;
  end if;
  -- Listeners are always muted.
  if new.role = 'listener' then
    new.muted := true;
  end if;
  return new;
end;
$$;
drop trigger if exists session_participants_guard on public.session_participants;
create trigger session_participants_guard before insert or update on public.session_participants
  for each row execute function public.session_participants_guard();

-- Ending a room lets everyone in it go.
create or replace function public.on_live_session_end()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'ended' and old.status <> 'ended' then
    new.ended_at := coalesce(new.ended_at, now());
    update public.session_participants set left_at = now(), hand_raised = false
      where session_id = new.id and left_at is null;
  end if;
  return new;
end;
$$;
drop trigger if exists on_live_session_end on public.live_sessions;
create trigger on_live_session_end before update on public.live_sessions
  for each row execute function public.on_live_session_end();

-- ----------------------------------------------------------------- Day One
create table if not exists public.day_one_claims (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('station', 'original')),
  item_id text not null check (char_length(item_id) between 1 and 120),
  item_label text not null default '' check (char_length(item_label) <= 120),
  -- Your place: 1 for the first person to play it.
  rank int not null check (rank >= 1),
  first_at timestamptz not null default now(),
  primary key (user_id, kind, item_id)
);
create index if not exists day_one_claims_item_idx on public.day_one_claims (kind, item_id, rank);
create index if not exists day_one_claims_badges_idx on public.day_one_claims (user_id) where rank <= 1000;
alter table public.day_one_claims enable row level security;

-- Badges are public on the Hub; the rest of your history is yours.
drop policy if exists "read day one badges" on public.day_one_claims;
create policy "read day one badges" on public.day_one_claims
  for select to authenticated using (rank <= 1000 or user_id = (select auth.uid()));
-- No insert or update policy: claims come only through claim_day_one.

create or replace function public.claim_day_one(k text, item text, label text default '')
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  existing public.day_one_claims;
  place int;
begin
  if me is null or not exists (select 1 from public.profiles where id = me) then
    raise exception 'Join the Hub first';
  end if;
  select * into existing from public.day_one_claims where user_id = me and kind = k and item_id = item;
  if found then
    return jsonb_build_object('rank', existing.rank, 'day_one', existing.rank <= 1000, 'first_at', existing.first_at, 'new', false);
  end if;
  -- One claim at a time per station or Original, so two people can't share a place.
  perform pg_advisory_xact_lock(hashtext(k || ':' || item));
  select coalesce(max(rank), 0) + 1 into place from public.day_one_claims where kind = k and item_id = item;
  insert into public.day_one_claims (user_id, kind, item_id, item_label, rank)
    values (me, k, item, left(coalesce(label, ''), 120), place);
  return jsonb_build_object('rank', place, 'day_one', place <= 1000, 'first_at', now(), 'new', true);
end;
$$;
grant execute on function public.claim_day_one(text, text, text) to authenticated;

-- ------------------------------------------------------------------ Splits
create table if not exists public.split_sheets (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  work_type text not null default 'song' check (work_type in ('song', 'beat', 'video', 'other')),
  notes text not null default '' check (char_length(notes) <= 1000),
  status text not null default 'draft' check (status in ('draft', 'signed')),
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.split_sheets enable row level security;

create table if not exists public.split_parties (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.split_sheets (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (char_length(role) between 2 and 40),
  share numeric(5, 2) not null check (share > 0 and share <= 100),
  agreed_at timestamptz,
  position int not null default 0,
  unique (sheet_id, user_id)
);
create index if not exists split_parties_user_idx on public.split_parties (user_id);
alter table public.split_parties enable row level security;

create or replace function public.on_split_sheet(s uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.split_sheets where id = s and created_by = (select auth.uid()))
      or exists (select 1 from public.split_parties where sheet_id = s and user_id = (select auth.uid()));
$$;

create or replace function public.drafts_split(s uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.split_sheets where id = s and created_by = (select auth.uid()) and status = 'draft');
$$;

drop policy if exists "parties read their sheets" on public.split_sheets;
drop policy if exists "start a sheet" on public.split_sheets;
drop policy if exists "edit your draft" on public.split_sheets;
drop policy if exists "delete your draft" on public.split_sheets;
create policy "parties read their sheets" on public.split_sheets
  for select to authenticated using (public.on_split_sheet(id));
create policy "start a sheet" on public.split_sheets
  for insert to authenticated with check (created_by = (select auth.uid()) and status = 'draft' and not public.is_banned());
create policy "edit your draft" on public.split_sheets
  for update to authenticated using (created_by = (select auth.uid()) and status = 'draft') with check (created_by = (select auth.uid()) and status = 'draft');
create policy "delete your draft" on public.split_sheets
  for delete to authenticated using (created_by = (select auth.uid()) and status = 'draft');

drop policy if exists "parties read the split" on public.split_parties;
drop policy if exists "creator adds parties" on public.split_parties;
drop policy if exists "creator edits parties" on public.split_parties;
drop policy if exists "creator removes parties" on public.split_parties;
create policy "parties read the split" on public.split_parties
  for select to authenticated using (public.on_split_sheet(sheet_id));
create policy "creator adds parties" on public.split_parties
  for insert to authenticated with check (public.drafts_split(sheet_id));
create policy "creator edits parties" on public.split_parties
  for update to authenticated using (public.drafts_split(sheet_id)) with check (public.drafts_split(sheet_id));
create policy "creator removes parties" on public.split_parties
  for delete to authenticated using (public.drafts_split(sheet_id));

-- Any change to who's on it or the shares means everyone agrees again.
-- Agreement itself only ever comes from agree_to_split.
create or replace function public.split_parties_reset()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- Agreeing (agree_to_split), or this trigger's own reset of the others.
  if current_setting('boa.split_agree', true) = 'on' or pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    new.agreed_at := null;
  elsif tg_op = 'UPDATE' then
    new.agreed_at := null;
  end if;
  update public.split_parties set agreed_at = null
    where sheet_id = coalesce(new.sheet_id, old.sheet_id)
      and id <> coalesce(new.id, old.id)
      and agreed_at is not null;
  update public.split_sheets set updated_at = now() where id = coalesce(new.sheet_id, old.sheet_id);
  return coalesce(new, old);
end;
$$;
drop trigger if exists split_parties_reset on public.split_parties;
create trigger split_parties_reset before insert or update or delete on public.split_parties
  for each row execute function public.split_parties_reset();

-- You agree to a sheet as yourself. The last party to agree signs it, once
-- the shares come to exactly 100%.
create or replace function public.agree_to_split(sheet uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  total numeric;
  waiting int;
  st text;
begin
  select status into st from public.split_sheets where id = sheet for update;
  if st is null then raise exception 'That split sheet was not found'; end if;
  if st = 'signed' then raise exception 'This split sheet is already signed'; end if;
  if not exists (select 1 from public.split_parties where sheet_id = sheet and user_id = me) then
    raise exception 'You are not on this split sheet';
  end if;
  select coalesce(sum(share), 0), count(*) filter (where agreed_at is null and user_id <> me)
    into total, waiting from public.split_parties where sheet_id = sheet;
  if total <> 100 then raise exception 'The shares must add up to 100%% before anyone agrees'; end if;
  if (select count(*) from public.split_parties where sheet_id = sheet) < 2 then
    raise exception 'A split needs at least two people';
  end if;
  perform set_config('boa.split_agree', 'on', true);
  update public.split_parties set agreed_at = now() where sheet_id = sheet and user_id = me;
  if waiting = 0 then
    update public.split_sheets set status = 'signed', signed_at = now(), updated_at = now() where id = sheet;
  end if;
  perform set_config('boa.split_agree', 'off', true);
  return jsonb_build_object('signed', waiting = 0, 'waiting', waiting);
end;
$$;
grant execute on function public.agree_to_split(uuid) to authenticated;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null check (char_length(number) between 1 and 40),
  issuer_id uuid not null references public.profiles (id) on delete cascade,
  -- A Hub member, or just a name and email for someone off the Hub.
  client_id uuid references public.profiles (id) on delete set null,
  client_name text not null check (char_length(client_name) between 1 and 120),
  client_email text check (char_length(client_email) <= 200),
  sheet_id uuid references public.split_sheets (id) on delete set null,
  -- [{ "description": "Mix and master", "qty": 1, "rate": 450 }]
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 50),
  currency text not null default 'GBP' check (currency in ('GBP', 'USD', 'EUR', 'NGN', 'GHS')),
  total numeric(12, 2) not null check (total >= 0),
  notes text not null default '' check (char_length(notes) <= 1000),
  due_date date,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  created_at timestamptz not null default now(),
  unique (issuer_id, number)
);
create index if not exists invoices_issuer_idx on public.invoices (issuer_id, created_at desc);
create index if not exists invoices_client_idx on public.invoices (client_id, created_at desc);
alter table public.invoices enable row level security;

drop policy if exists "issuer and client read invoices" on public.invoices;
drop policy if exists "issue invoices as yourself" on public.invoices;
drop policy if exists "issuer edits invoices" on public.invoices;
drop policy if exists "issuer deletes invoices" on public.invoices;
create policy "issuer and client read invoices" on public.invoices
  for select to authenticated using (issuer_id = (select auth.uid()) or client_id = (select auth.uid()));
create policy "issue invoices as yourself" on public.invoices
  for insert to authenticated with check (issuer_id = (select auth.uid()) and not public.is_banned());
create policy "issuer edits invoices" on public.invoices
  for update to authenticated using (issuer_id = (select auth.uid())) with check (issuer_id = (select auth.uid()));
create policy "issuer deletes invoices" on public.invoices
  for delete to authenticated using (issuer_id = (select auth.uid()));

-- ------------------------------------------------------------ realtime
do $$
declare
  t text;
begin
  foreach t in array array['posts', 'live_sessions', 'session_participants', 'split_sheets', 'split_parties'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- --------------------------------------------------------- GDPR export
create or replace function public.export_my_data()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = (select auth.uid())),
    'blocks', coalesce((select jsonb_agg(to_jsonb(b)) from public.blocks b where b.blocker_id = (select auth.uid())), '[]'),
    'conversations', coalesce((select jsonb_agg(to_jsonb(c)) from public.conversations c where (select auth.uid()) in (c.user_a, c.user_b)), '[]'),
    'messages_sent', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from public.messages m where m.sender_id = (select auth.uid())), '[]'),
    'reports_filed', coalesce((select jsonb_agg(to_jsonb(r)) from public.reports r where r.reporter_id = (select auth.uid())), '[]'),
    'push_tokens', coalesce((select jsonb_agg(jsonb_build_object('platform', t.platform, 'sound', t.sound, 'updated_at', t.updated_at)) from public.push_tokens t where t.user_id = (select auth.uid())), '[]'),
    'posts', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.posts x where x.author_id = (select auth.uid())), '[]'),
    'live_sessions_hosted', coalesce((select jsonb_agg(to_jsonb(s)) from public.live_sessions s where s.host_id = (select auth.uid())), '[]'),
    'day_one', coalesce((select jsonb_agg(to_jsonb(d)) from public.day_one_claims d where d.user_id = (select auth.uid())), '[]'),
    'split_sheets', coalesce((select jsonb_agg(to_jsonb(s)) from public.split_sheets s where public.on_split_sheet(s.id)), '[]'),
    'invoices', coalesce((select jsonb_agg(to_jsonb(i)) from public.invoices i where i.issuer_id = (select auth.uid())), '[]')
  );
$$;

notify pgrst, 'reload schema';

commit;
