-- BOA HUB: cloud-only media links, view-once photos and videos in chat,
-- and public profile pages for search engines.
--
-- Run once in the Supabase dashboard > SQL editor, after
-- 20261026150000_drop_cipher.sql. One transaction. Safe to run again.
--
--  1. Cloud-only media. A profile picture or post is only ever saved as
--     its permanent https:// Storage link, never a path on someone's phone
--     (file://, content://), which breaks on a reinstall or a new phone.
--     Any avatar saved as a phone path is cleared (it never loaded for
--     anyone else anyway), and the database now refuses new ones.
--  2. View once. messages.view_once marks a photo or video that can be
--     opened once, by the person it was sent to. open_view_once() stamps
--     viewed_at as it hands over the file; the file is then readable for
--     two minutes only, and the recipient's app deletes it from Storage
--     as soon as it's closed. The sender can't open it either.
--  3. Public profile links. public_profile(username) is what anyone with
--     a profile link sees on the web without an account: the display
--     picture, name, handle and Favourites (hearted stations and BOA
--     Originals). Never posts, reels, bio or anything else: those need an
--     account, on every profile. Private profiles (hidden from the Hub, or
--     profiles.searchable off) still open from a link but come back with
--     indexable = false, so the page tells search engines not to list
--     them. public_profile_handles() lists the indexable ones for the
--     sitemap.

begin;

-- ------------------------------------------------------ 1. cloud-only media
update public.profiles set avatar_url = null where avatar_url is not null and avatar_url !~* '^https://';

alter table public.profiles drop constraint if exists profiles_avatar_cloud_check;
alter table public.profiles add constraint profiles_avatar_cloud_check
  check (avatar_url is null or avatar_url ~* '^https://');

-- Posts have always been saved with their Storage link; NOT VALID checks
-- every new or edited post without rewriting the old ones.
alter table public.posts drop constraint if exists posts_media_cloud_check;
alter table public.posts add constraint posts_media_cloud_check
  check (media_url ~* '^https://') not valid;

-- ------------------------------------------------------------- 2. view once
alter table public.messages
  add column if not exists view_once boolean not null default false,
  add column if not exists viewed_at timestamptz;

alter table public.messages drop constraint if exists messages_view_once_check;
alter table public.messages add constraint messages_view_once_check
  check (not view_once or kind in ('image', 'video'));

create index if not exists messages_view_once_path_idx on public.messages (media_path) where view_once;

-- A new message is never already opened, whatever the app sent.
create or replace function public.on_message_view_once()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.viewed_at := null;
  return new;
end;
$$;
drop trigger if exists messages_view_once on public.messages;
create trigger messages_view_once before insert on public.messages
  for each row execute function public.on_message_view_once();

-- Opens a view-once photo or video: stamps it opened and returns its
-- Storage path. Only the recipient, and only once. (There is no update
-- policy on messages, so this is the only way viewed_at is ever set.)
create or replace function public.open_view_once(msg uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  m public.messages;
begin
  select * into m from public.messages where id = msg for update;
  if m.id is null or not public.is_member(m.conversation_id) then
    raise exception 'That message is no longer available.' using errcode = 'P0002';
  end if;
  if not m.view_once then return m.media_path; end if;
  if m.sender_id = (select auth.uid()) then
    raise exception 'View once: only the person you sent it to can open it.' using errcode = 'P0001';
  end if;
  if m.viewed_at is not null then
    raise exception 'You''ve already opened this.' using errcode = 'P0001';
  end if;
  update public.messages set viewed_at = now() where id = msg;
  return m.media_path;
end;
$$;
revoke all on function public.open_view_once(uuid) from public, anon;
grant execute on function public.open_view_once(uuid) to authenticated;

-- The chat list and the push say what it is, never show it.
create or replace function public.on_message_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.conversations c
  set last_message_at = new.created_at,
      last_message_preview = left(case
        when new.view_once and new.kind = 'image' then '📷 View once photo'
        when new.view_once and new.kind = 'video' then '🎬 View once video'
        when new.kind = 'image' then coalesce('📷 ' || nullif(btrim(new.body), ''), '📷 Photo')
        when new.kind = 'video' then coalesce('🎬 ' || nullif(btrim(new.body), ''), '🎬 Video')
        when new.kind = 'voice' then '🎙️ Voice note'
        else new.body
      end, 140),
      last_sender_id = new.sender_id,
      a_last_read_at = case when c.user_a = new.sender_id then new.created_at else c.a_last_read_at end,
      b_last_read_at = case when c.user_b = new.sender_id then new.created_at else c.b_last_read_at end
  where c.id = new.conversation_id;
  return new;
end;
$$;

-- Whether the caller may read this chat file. Members can read their
-- conversation's files, except view-once ones: those only by the
-- recipient, and only in the two minutes after they opened it.
create or replace function public.chat_media_readable(path text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  m public.messages;
begin
  if not public.chat_media_member(path) then return false; end if;
  select * into m from public.messages where media_path = path and view_once limit 1;
  if m.id is null then return true; end if;
  return m.sender_id <> (select auth.uid())
    and m.viewed_at is not null
    and m.viewed_at > now() - interval '2 minutes';
end;
$$;

-- Whether this is a view-once file the caller has already opened (so
-- their app may delete it).
create or replace function public.chat_media_spent(path text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.messages m
    where m.media_path = path
      and m.view_once
      and m.viewed_at is not null
      and m.sender_id <> (select auth.uid())
      and public.is_member(m.conversation_id)
  );
$$;

drop policy if exists "chat media read members" on storage.objects;
create policy "chat media read members" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-media' and public.chat_media_readable(name));

drop policy if exists "chat media delete opened view once" on storage.objects;
create policy "chat media delete opened view once" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-media' and public.chat_media_spent(name));

-- ------------------------------------------------------- 3. public profiles
alter table public.profiles add column if not exists searchable boolean not null default true;

create or replace function public.public_profile(handle text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'indexable', p.visible_on_hub and p.searchable,
    'favourites', coalesce((
      select jsonb_agg(jsonb_build_object('target_kind', h.target_kind, 'target_id', h.target_id, 'target_label', h.target_label, 'target_meta', h.target_meta) order by h.created_at desc)
      from (
        select * from public.hearts hh
        where hh.liker_id = p.id and hh.target_kind <> 'post'
        order by hh.created_at desc
        limit 24
      ) h
    ), '[]'::jsonb)
  )
  from public.profiles p
  where p.username = lower(btrim(handle))
    and p.banned_at is null;
$$;
revoke all on function public.public_profile(text) from public;
grant execute on function public.public_profile(text) to anon, authenticated;

create or replace function public.public_profile_handles()
returns table (username text, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select p.username, coalesce(p.status_updated_at, p.created_at)
  from public.profiles p
  where p.visible_on_hub and p.searchable and p.banned_at is null
  order by p.created_at
  limit 50000;
$$;
revoke all on function public.public_profile_handles() from public;
grant execute on function public.public_profile_handles() to anon, authenticated;

notify pgrst, 'reload schema';

commit;
