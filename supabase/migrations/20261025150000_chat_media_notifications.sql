-- BOA HUB Chat: photos, videos and voice notes; disappearing messages; and
-- push notifications for new messages.
--
--  1. messages gets a kind (text / image / video / voice), the media's
--     storage path and details, and expires_at. Media messages may have an
--     empty body (a caption is optional).
--  2. profiles.disappearing_messages: when on, everything you send expires
--     24 hours later. A trigger stamps expires_at, so the app can't skip it.
--     Expired messages are hidden by the read policy at once, and deleted
--     every 15 minutes (pg_cron, when the project has it).
--  3. chat-media: a private Storage bucket. Files live at
--     <conversation id>/<sender id>/<file>; only the two people in that
--     conversation can read them, and only the sender can write there.
--     64 MB per file (videos; photos are held to 16 MB by the app).
--  4. push_tokens: each signed-in phone's Expo push token and its chosen
--     notification sound. A trigger on new messages sends a push to the
--     other person's phones through Expo's push service (pg_net).
--
-- Run once in the Supabase dashboard > SQL editor, after
-- 20261025120000_trending_radio.sql. One transaction: if any statement
-- fails, nothing changes.
--
-- Two settings live outside SQL:
--  - Storage > Settings > "Upload file size limit" is 50 MB on the Free
--    plan, which caps videos below the bucket's 64 MB. Raise it (Pro) for
--    the full 64 MB.
--  - Android push goes through Firebase: upload the FCM V1 service account
--    key to EAS (eas credentials) and add google-services.json, or Expo's
--    push service can't reach Android phones. Without it, the app still
--    buzzes for new messages while it's open or in the background.

begin;

create extension if not exists pg_net;

-- ---------------------------------------------------------------- messages
alter table public.messages
  add column if not exists kind text not null default 'text'
    check (kind in ('text', 'image', 'video', 'voice')),
  add column if not exists media_path text check (char_length(media_path) <= 300),
  add column if not exists media_mime text check (char_length(media_mime) <= 80),
  add column if not exists media_size bigint check (media_size between 0 and 67108864),
  add column if not exists media_width int check (media_width between 0 and 20000),
  add column if not exists media_height int check (media_height between 0 and 20000),
  add column if not exists media_duration_ms int check (media_duration_ms between 0 and 3600000),
  -- A voice note's levels, 0 to 100, for the waveform in the bubble.
  add column if not exists waveform smallint[] check (cardinality(waveform) <= 120),
  add column if not exists expires_at timestamptz;

alter table public.messages alter column body set default '';

-- Text needs words; media needs a file (its caption may be empty).
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check check (
  char_length(body) <= 2000
  and case when kind = 'text' then char_length(btrim(body)) >= 1 else media_path is not null end
);

-- A media file must sit in this conversation's folder, under the sender.
alter table public.messages drop constraint if exists messages_media_folder_check;
alter table public.messages add constraint messages_media_folder_check check (
  media_path is null or media_path like conversation_id::text || '/' || sender_id::text || '/%'
);

create index if not exists messages_expiry_idx on public.messages (expires_at) where expires_at is not null;

-- ---------------------------------------------------------------- profiles
alter table public.profiles add column if not exists disappearing_messages boolean not null default false;

-- Stamps expires_at from the sender's setting (whatever the app sent).
create or replace function public.on_message_stamp_expiry()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.expires_at := case
    when (select p.disappearing_messages from public.profiles p where p.id = new.sender_id) then new.created_at + interval '24 hours'
    else null
  end;
  return new;
end;
$$;
drop trigger if exists messages_stamp_expiry on public.messages;
create trigger messages_stamp_expiry before insert on public.messages
  for each row execute function public.on_message_stamp_expiry();

-- The chat list's preview says what a media message is.
create or replace function public.on_message_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.conversations c
  set last_message_at = new.created_at,
      last_message_preview = left(case new.kind
        when 'image' then coalesce('📷 ' || nullif(btrim(new.body), ''), '📷 Photo')
        when 'video' then coalesce('🎬 ' || nullif(btrim(new.body), ''), '🎬 Video')
        when 'voice' then '🎙️ Voice note'
        else new.body
      end, 140),
      last_sender_id = new.sender_id,
      a_last_read_at = case when c.user_a = new.sender_id then new.created_at else c.a_last_read_at end,
      b_last_read_at = case when c.user_b = new.sender_id then new.created_at else c.b_last_read_at end
  where c.id = new.conversation_id;
  return new;
end;
$$;

-- Expired messages are gone for both people the moment they expire.
drop policy if exists "members read messages" on public.messages;
create policy "members read messages" on public.messages
  for select to authenticated using (
    public.is_member(conversation_id)
    and (expires_at is null or expires_at > now())
  );

-- Deletes expired messages. Their files stay in chat-media (Supabase
-- doesn't allow deleting Storage files from SQL) but are only reachable
-- through short-lived signed links, which the app makes for messages it
-- can still read.
create or replace function public.purge_expired_messages()
returns void language sql security definer set search_path = ''
as $$
  delete from public.messages where expires_at is not null and expires_at <= now();
$$;
revoke all on function public.purge_expired_messages() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'boa-purge-expired-messages';
  perform cron.schedule('boa-purge-expired-messages', '*/15 * * * *', 'select public.purge_expired_messages()');
exception when others then
  raise notice 'pg_cron not available (%): expired messages stay hidden but are not deleted automatically.', sqlerrm;
end;
$$;

-- -------------------------------------------------------------- push_tokens
create table if not exists public.push_tokens (
  token text primary key check (char_length(token) <= 200),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text check (platform in ('android', 'ios', 'web')),
  -- The phone's notification sound: also its Android channel (boa-chat-<sound>).
  sound text not null default 'pager' check (sound ~ '^[a-z0-9_]{1,24}$'),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "read own push tokens" on public.push_tokens;
drop policy if exists "add own push token" on public.push_tokens;
drop policy if exists "update own push token" on public.push_tokens;
drop policy if exists "remove own push token" on public.push_tokens;
create policy "read own push tokens" on public.push_tokens
  for select to authenticated using (user_id = (select auth.uid()));
create policy "add own push token" on public.push_tokens
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own push token" on public.push_tokens
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "remove own push token" on public.push_tokens
  for delete to authenticated using (user_id = (select auth.uid()));

-- A phone that changes hands moves its token to whoever signs in on it.
create or replace function public.claim_push_token(t text, plat text, snd text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not signed in'; end if;
  insert into public.push_tokens (token, user_id, platform, sound, updated_at)
  values (t, me, plat, coalesce(snd, 'pager'), now())
  on conflict (token) do update
    set user_id = me, platform = excluded.platform, sound = excluded.sound, updated_at = now();
end;
$$;
revoke all on function public.claim_push_token(text, text, text) from public, anon;
grant execute on function public.claim_push_token(text, text, text) to authenticated;

-- New message: a push to each of the other person's phones, with their
-- sound. Nothing goes out across a block. The text is shown only for text
-- messages; media says what it is.
create or replace function public.on_message_push()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  conv public.conversations;
  recipient uuid;
  sender_name text;
  preview text;
  payload jsonb;
begin
  select * into conv from public.conversations where id = new.conversation_id;
  recipient := case when conv.user_a = new.sender_id then conv.user_b else conv.user_a end;
  if public.is_blocked(new.sender_id, recipient) then return new; end if;
  select coalesce(nullif(p.display_name, ''), '@' || p.username) into sender_name from public.profiles p where p.id = new.sender_id;
  preview := case new.kind
    when 'image' then '📷 Photo'
    when 'video' then '🎬 Video'
    when 'voice' then '🎙️ Voice note'
    else left(new.body, 140)
  end;
  select jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', sender_name,
    'body', preview,
    'sound', 'chat_' || t.sound || '.wav',
    'channelId', 'boa-chat-' || t.sound,
    'priority', 'high',
    'data', jsonb_build_object('type', 'chat', 'conversationId', new.conversation_id, 'messageId', new.id)
  ))
  into payload
  from public.push_tokens t
  where t.user_id = recipient;
  if payload is null then return new; end if;
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := payload,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
  );
  return new;
exception when others then
  -- A push that can't go out never stops the message being sent.
  raise warning 'chat push failed: %', sqlerrm;
  return new;
end;
$$;
drop trigger if exists messages_push on public.messages;
create trigger messages_push after insert on public.messages
  for each row execute function public.on_message_push();

-- The GDPR export includes the phones registered for notifications.
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
    'push_tokens', coalesce((select jsonb_agg(jsonb_build_object('platform', t.platform, 'sound', t.sound, 'updated_at', t.updated_at)) from public.push_tokens t where t.user_id = (select auth.uid())), '[]')
  );
$$;

-- ------------------------------------------------------------------ storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media', 'chat-media', false, 67108864,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
    'video/mp4', 'video/quicktime', 'video/3gpp', 'video/webm',
    'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/webm'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Whether the caller is in the conversation a chat-media path starts with.
-- Checks the folder is a uuid before casting, so a stray path never errors.
create or replace function public.chat_media_member(path text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  folder text := (storage.foldername(path))[1];
begin
  if folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return public.is_member(folder::uuid);
end;
$$;

drop policy if exists "chat media read members" on storage.objects;
drop policy if exists "chat media upload sender" on storage.objects;
drop policy if exists "chat media delete sender" on storage.objects;

create policy "chat media read members" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-media' and public.chat_media_member(name));
create policy "chat media upload sender" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and public.chat_media_member(name)
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
create policy "chat media delete sender" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-media' and (storage.foldername(name))[2] = (select auth.uid())::text);

notify pgrst, 'reload schema';

commit;
