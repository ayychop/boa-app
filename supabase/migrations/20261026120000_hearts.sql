-- BOA HUB: hearts.
--
-- Run once in the Supabase dashboard > SQL editor, after
-- 20261026090000_posts_cipher_day_one_splits.sql. One transaction. Safe to
-- run again.
--
-- You can heart a post (a photo or video), a radio station or a BOA
-- Original. The rules, enforced here:
--  - There are no like counts. Nobody can count a post's hearts: only the
--    post's owner can read the hearts on it (that's their notifications),
--    and the person who gave a heart can read their own.
--  - The owner of a post gets a push ("Kofi loved your photo"). Nothing goes
--    out across a block, and nothing at all is recorded about what the
--    owner does next: there are no read receipts on hearts and no profile
--    views, so ignoring a heart tells the giver nothing.
--  - Hearted stations and Originals are your favourites, shown on your
--    profile to anyone who can see it.

begin;

create table if not exists public.hearts (
  liker_id uuid not null references public.profiles (id) on delete cascade,
  target_kind text not null check (target_kind in ('post', 'station', 'original')),
  target_id text not null check (char_length(target_id) between 1 and 120),
  -- Who made it: a post's author (set by the database). Null for stations
  -- and Originals.
  owner_id uuid references public.profiles (id) on delete cascade,
  -- What to show on a favourites row: the name, and for a station what it
  -- takes to play it ({ name, logo, streamUrl, country }).
  target_label text not null default '' check (char_length(target_label) <= 120),
  target_meta jsonb not null default '{}' check (pg_column_size(target_meta) <= 4000),
  created_at timestamptz not null default now(),
  primary key (liker_id, target_kind, target_id)
);
create index if not exists hearts_owner_idx on public.hearts (owner_id, created_at desc) where owner_id is not null;
create index if not exists hearts_favourites_idx on public.hearts (liker_id, target_kind, created_at desc) where target_kind <> 'post';
alter table public.hearts enable row level security;

-- A post's author, stamped by the database; a heart on a post you can't
-- see (or across a block) is refused.
create or replace function public.hearts_stamp()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  author uuid;
begin
  if new.target_kind = 'post' then
    select author_id into author from public.posts where id::text = new.target_id;
    if author is null then raise exception 'That post is no longer there'; end if;
    if public.is_blocked(new.liker_id, author) then raise exception 'You can''t heart this post'; end if;
    new.owner_id := author;
  else
    new.owner_id := null;
  end if;
  return new;
end;
$$;
drop trigger if exists hearts_stamp on public.hearts;
create trigger hearts_stamp before insert on public.hearts
  for each row execute function public.hearts_stamp();

drop policy if exists "read own hearts, hearts on yours and visible favourites" on public.hearts;
drop policy if exists "heart as yourself" on public.hearts;
drop policy if exists "take back your heart" on public.hearts;
create policy "read own hearts, hearts on yours and visible favourites" on public.hearts
  for select to authenticated using (
    liker_id = (select auth.uid())
    or owner_id = (select auth.uid())
    or (target_kind <> 'post' and exists (select 1 from public.profiles p where p.id = liker_id))
  );
create policy "heart as yourself" on public.hearts
  for insert to authenticated with check (liker_id = (select auth.uid()) and not public.is_banned());
create policy "take back your heart" on public.hearts
  for delete to authenticated using (liker_id = (select auth.uid()));
-- No update policy: a heart is given or taken back, never edited.

-- The push to the post's owner.
create or replace function public.on_heart_push()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  liker_name text;
  what text;
  payload jsonb;
begin
  if new.owner_id is null or new.owner_id = new.liker_id then return new; end if;
  if public.is_blocked(new.liker_id, new.owner_id) then return new; end if;
  select coalesce(nullif(p.display_name, ''), '@' || p.username) into liker_name from public.profiles p where p.id = new.liker_id;
  select case when kind = 'video' then 'video' else 'photo' end into what from public.posts where id::text = new.target_id;
  select jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', '❤️ ' || liker_name,
    'body', 'loved your ' || coalesce(what, 'post'),
    'sound', 'chat_' || t.sound || '.wav',
    'channelId', 'boa-chat-' || t.sound,
    'priority', 'high',
    'data', jsonb_build_object('type', 'heart', 'likerId', new.liker_id, 'postId', new.target_id)
  ))
  into payload
  from public.push_tokens t
  where t.user_id = new.owner_id;
  if payload is null then return new; end if;
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := payload,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
  );
  return new;
exception when others then
  raise warning 'heart push failed: %', sqlerrm;
  return new;
end;
$$;
drop trigger if exists hearts_push on public.hearts;
create trigger hearts_push after insert on public.hearts
  for each row execute function public.on_heart_push();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hearts'
  ) then
    alter publication supabase_realtime add table public.hearts;
  end if;
end;
$$;

-- The GDPR export: the hearts you've given.
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
    'invoices', coalesce((select jsonb_agg(to_jsonb(i)) from public.invoices i where i.issuer_id = (select auth.uid())), '[]'),
    'hearts_given', coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at) from public.hearts h where h.liker_id = (select auth.uid())), '[]')
  );
$$;

notify pgrst, 'reload schema';

commit;
