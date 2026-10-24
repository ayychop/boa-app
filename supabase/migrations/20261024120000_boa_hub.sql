-- BOA HUB: the Creative Hub's schema. Run against the BOA HUB project
-- (Supabase dashboard > SQL editor, or `supabase db push`).
--
-- Tables: profiles, blocks, conversations, messages, reports.
-- Every table has row level security on; the app only ever uses the anon
-- key, so these policies are the whole of the access control.
--
-- Privacy rules, in short:
--  - You can read and edit your own profile. Other profiles are readable
--    only while they are visible on the Hub (or you already share a
--    conversation), and never across a block in either direction.
--  - Conversations and messages are readable only by their two members.
--    Nobody can message someone who has blocked them, or whom they blocked.
--  - Reports are write-only for users (you can read the ones you filed);
--    moderators read them with the service role, outside the app.
--  - delete_my_account() erases the caller's account and everything that
--    cascades from it (GDPR Article 17). export_my_data() returns it all
--    (Article 15).

create extension if not exists citext;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username citext not null unique
    check (username ~ '^[a-z0-9_.]{3,24}$'),
  display_name text check (char_length(display_name) <= 50),
  avatar_url text check (char_length(avatar_url) <= 500),
  bio text check (char_length(bio) <= 280),
  roles text[] not null default '{}'
    check (cardinality(roles) <= 6 and roles <@ array[
      'actor', 'director', 'writer', 'producer', 'cinematographer', 'editor',
      'musician', 'singer', 'music_producer', 'dj', 'sound', 'makeup',
      'stylist', 'photographer', 'dancer', 'presenter', 'model', 'crew'
    ]::text[]),
  -- Age verification is a declaration made at sign-up (18 and over only:
  -- the Hub has direct messages between adults). The date of birth itself
  -- is checked on the phone and never stored.
  adult_confirmed_at timestamptz not null,
  terms_accepted_at timestamptz not null,
  terms_version text not null,
  visible_on_hub boolean not null default true,
  open_for_work boolean not null default false,
  -- "Currently listening / watching", shown on the profile.
  status_kind text check (status_kind in ('listening', 'watching')),
  status_text text check (char_length(status_text) <= 120),
  status_updated_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_directory_idx on public.profiles (open_for_work desc, last_seen_at desc) where visible_on_hub;
create index profiles_roles_idx on public.profiles using gin (roles);

-- ------------------------------------------------------------------ blocks
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

-- True if either has blocked the other. Security definer so policies on
-- other tables can ask without being able to read anyone's block list.
create function public.is_blocked(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- ----------------------------------------------------------- conversations
-- One per pair of people: user_a is always the smaller id, so a pair can
-- only ever have one thread. Read receipts are each side's last read time.
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_preview text,
  last_sender_id uuid,
  a_last_read_at timestamptz,
  b_last_read_at timestamptz,
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index conversations_a_idx on public.conversations (user_a, last_message_at desc);
create index conversations_b_idx on public.conversations (user_b, last_message_at desc);

create function public.is_member(conv uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = conv and (select auth.uid()) in (c.user_a, c.user_b)
  );
$$;

-- Shares a conversation with the caller (so a hidden profile still shows
-- its name in threads you already have).
create function public.shares_conversation(other uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where (c.user_a = (select auth.uid()) and c.user_b = other)
       or (c.user_b = (select auth.uid()) and c.user_a = other)
  );
$$;

-- ---------------------------------------------------------------- messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_thread_idx on public.messages (conversation_id, created_at desc);

-- ----------------------------------------------------------------- reports
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- Kept (as null) if the reported account is deleted, so moderators
  -- still see the report.
  reported_user_id uuid references public.profiles (id) on delete set null,
  message_id uuid references public.messages (id) on delete set null,
  -- A copy of the reported message, so deleting it doesn't destroy evidence.
  message_excerpt text check (char_length(message_excerpt) <= 2000),
  reason text not null check (reason in ('spam', 'harassment', 'hate', 'sexual', 'scam', 'underage', 'impersonation', 'other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at timestamptz not null default now()
  -- No check that it names someone: deleting the reported account nulls
  -- both columns, and the report must survive that. The insert policy
  -- below requires a target instead.
);
create index reports_open_idx on public.reports (status, created_at) where status = 'open';

-- --------------------------------------------------------------- triggers
create function public.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Keeps the chat list sorted by the latest message, with a preview.
create function public.on_message_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.conversations c
  set last_message_at = new.created_at,
      last_message_preview = left(new.body, 140),
      last_sender_id = new.sender_id,
      -- Sending counts as having read the thread.
      a_last_read_at = case when c.user_a = new.sender_id then new.created_at else c.a_last_read_at end,
      b_last_read_at = case when c.user_b = new.sender_id then new.created_at else c.b_last_read_at end
  where c.id = new.conversation_id;
  return new;
end;
$$;
create trigger messages_after_insert after insert on public.messages
  for each row execute function public.on_message_insert();

-- ----------------------------------------------------- row level security
alter table public.profiles enable row level security;
alter table public.blocks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;

-- Profiles
create policy "read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "read visible profiles" on public.profiles
  for select to authenticated using (
    (visible_on_hub or public.shares_conversation(id))
    and not public.is_blocked((select auth.uid()), id)
  );
create policy "create own profile" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "update own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Blocks: your own list only.
create policy "read own blocks" on public.blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
create policy "block someone" on public.blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy "unblock someone" on public.blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));

-- Conversations: members read; created and marked read only through the
-- functions below, so nobody can forge another person's read receipt.
create policy "members read conversations" on public.conversations
  for select to authenticated using ((select auth.uid()) in (user_a, user_b));

-- Messages
create policy "members read messages" on public.messages
  for select to authenticated using (public.is_member(conversation_id));
create policy "members send messages" on public.messages
  for insert to authenticated with check (
    sender_id = (select auth.uid())
    and public.is_member(conversation_id)
    and not exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and public.is_blocked(c.user_a, c.user_b)
    )
  );
create policy "delete own messages" on public.messages
  for delete to authenticated using (sender_id = (select auth.uid()));

-- Reports: file them; see only your own.
create policy "file a report" on public.reports
  for insert to authenticated with check (
    reporter_id = (select auth.uid())
    and status = 'open'
    and (reported_user_id is not null or message_id is not null)
  );
create policy "read own reports" on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()));

-- -------------------------------------------------------------- functions
-- Opens (or finds) the thread with someone. Refuses across a block, with
-- yourself, and with anyone hidden from the Hub you don't already talk to.
create function public.start_conversation(other uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  a uuid := least(me, other);
  b uuid := greatest(me, other);
  conv uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  if other = me then raise exception 'cannot message yourself'; end if;
  if public.is_blocked(me, other) then raise exception 'cannot message this person'; end if;
  select id into conv from public.conversations where user_a = a and user_b = b;
  if conv is not null then return conv; end if;
  if not exists (select 1 from public.profiles where id = other and visible_on_hub) then
    raise exception 'profile not available';
  end if;
  insert into public.conversations (user_a, user_b) values (a, b) returning id into conv;
  return conv;
end;
$$;

-- Read receipt: the caller has read the thread up to now.
create function public.mark_read(conv uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.conversations
  set a_last_read_at = case when user_a = (select auth.uid()) then now() else a_last_read_at end,
      b_last_read_at = case when user_b = (select auth.uid()) then now() else b_last_read_at end
  where id = conv and (select auth.uid()) in (user_a, user_b);
$$;

-- GDPR Article 15: everything the Hub holds about the caller.
create function public.export_my_data()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = (select auth.uid())),
    'blocks', coalesce((select jsonb_agg(to_jsonb(b)) from public.blocks b where b.blocker_id = (select auth.uid())), '[]'),
    'conversations', coalesce((select jsonb_agg(to_jsonb(c)) from public.conversations c where (select auth.uid()) in (c.user_a, c.user_b)), '[]'),
    'messages_sent', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from public.messages m where m.sender_id = (select auth.uid())), '[]'),
    'reports_filed', coalesce((select jsonb_agg(to_jsonb(r)) from public.reports r where r.reporter_id = (select auth.uid())), '[]')
  );
$$;

-- GDPR Article 17: erases the caller's account. Deleting the auth user
-- cascades to the profile, and from it to blocks, conversations (and so
-- every message in them, both sides) and the reports they filed; reports
-- about them are kept with the person removed. The avatar is removed by
-- the app through the Storage API first (Supabase doesn't allow deleting
-- storage objects from SQL).
create function public.delete_my_account()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.export_my_data() from public, anon;
revoke all on function public.start_conversation(uuid) from public, anon;
revoke all on function public.mark_read(uuid) from public, anon;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.start_conversation(uuid) to authenticated;
grant execute on function public.mark_read(uuid) to authenticated;

-- --------------------------------------------------------------- realtime
-- New messages and chat-list updates stream to the app (RLS still applies).
alter publication supabase_realtime add table public.messages, public.conversations;

-- ------------------------------------------------------------------ storage
-- Avatars: public to read (they're profile pictures), and each person can
-- only write inside their own folder: avatars/<user id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatar upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatar replace own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatar delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
