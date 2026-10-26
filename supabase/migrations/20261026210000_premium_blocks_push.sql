-- BOA Premium trial, block evidence, and chat pushes through an Edge Function.
--
-- Run in the Supabase SQL editor after 20261026180000. Safe to run again.
--
--  1. profiles.subscription_status ('trial', 'active', 'expired') and
--     profiles.trial_start_date. Everyone gets a 48-hour trial from the
--     moment their profile is created (existing members: from now). Only an
--     admin or the server can change either column; the app can't grant
--     itself Premium. premium_access() is what the app asks.
--  2. blocks.block_reason and blocks.block_evidence_url, a private
--     block-evidence bucket for the screenshot, and admin read access so
--     blocks show in the Admin Portal.
--  3. New-message pushes go through the message-push Edge Function once
--     it's deployed and set up (set_push_function below); until then the
--     database sends them to Expo itself, as before.

-- ------------------------------------------------------------ 1. premium
alter table public.profiles add column if not exists subscription_status text not null default 'trial';
alter table public.profiles add column if not exists trial_start_date timestamptz not null default now();
alter table public.profiles drop constraint if exists profiles_subscription_status_check;
alter table public.profiles add constraint profiles_subscription_status_check
  check (subscription_status in ('trial', 'active', 'expired'));

-- The trial length, in one place.
create or replace function public.premium_trial_length()
returns interval language sql immutable as $$ select interval '48 hours' $$;

-- The admin-only columns, now with the subscription ones. A new profile
-- always starts on a fresh trial, whatever the app sends.
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.is_boa_star := false;
      new.is_featured := false;
      new.banned_at := null;
      new.subscription_status := 'trial';
      new.trial_start_date := now();
    else
      new.is_boa_star := old.is_boa_star;
      new.is_featured := old.is_featured;
      new.banned_at := old.banned_at;
      new.subscription_status := old.subscription_status;
      new.trial_start_date := old.trial_start_date;
    end if;
  end if;
  return new;
end;
$$;

-- What the signed-in member can use. A trial past 48 hours reads as
-- 'expired'. Admins always have access, whatever their status.
create or replace function public.premium_access()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  p public.profiles;
  admin boolean := public.is_admin();
  ends timestamptz;
  status text;
begin
  if me is null then
    return jsonb_build_object('status', 'expired', 'has_access', false, 'is_admin', false, 'trial_ends_at', null);
  end if;
  select * into p from public.profiles where id = me;
  if p.id is null then
    return jsonb_build_object('status', 'expired', 'has_access', admin, 'is_admin', admin, 'trial_ends_at', null);
  end if;
  ends := p.trial_start_date + public.premium_trial_length();
  status := p.subscription_status;
  if status = 'trial' and now() >= ends then status := 'expired'; end if;
  return jsonb_build_object(
    'status', status,
    'has_access', admin or status = 'active' or status = 'trial',
    'is_admin', admin,
    'trial_ends_at', case when p.subscription_status = 'trial' then ends end
  );
end;
$$;
revoke all on function public.premium_access() from public, anon;
grant execute on function public.premium_access() to authenticated;

-- ------------------------------------------------------- 2. block evidence
alter table public.blocks add column if not exists block_reason text check (char_length(block_reason) <= 500);
alter table public.blocks add column if not exists block_evidence_url text check (block_evidence_url ~ '^https://');
alter table public.blocks add column if not exists created_at timestamptz not null default now();

drop policy if exists "admins read all blocks" on public.blocks;
create policy "admins read all blocks" on public.blocks
  for select to authenticated using (public.is_admin());

-- Screenshots for a block: private. You upload into your own folder
-- (<your id>/...); only you and BOA admins can open them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('block-evidence', 'block-evidence', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "block evidence upload own" on storage.objects;
create policy "block evidence upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'block-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "block evidence read own or admin" on storage.objects;
create policy "block evidence read own or admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'block-evidence' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

-- ---------------------------------------------------- 3. pushes via Edge
-- Where the message-push function lives and the secret it checks. Not in
-- an API schema, so only the SQL editor and security definer code see it.
create schema if not exists private;
create table if not exists private.push_settings (
  id boolean primary key default true check (id),
  function_url text not null check (function_url ~ '^https://'),
  secret text not null check (char_length(secret) >= 24)
);
revoke all on private.push_settings from public, anon, authenticated;

-- Run once, after deploying the function (see supabase/functions/message-push):
--   select private.set_push_function('https://<project>.supabase.co/functions/v1/message-push', '<PUSH_WEBHOOK_SECRET>');
create or replace function private.set_push_function(url text, secret text)
returns void language sql security definer set search_path = ''
as $$
  insert into private.push_settings (id, function_url, secret) values (true, url, secret)
  on conflict (id) do update set function_url = excluded.function_url, secret = excluded.secret;
$$;
revoke all on function private.set_push_function(text, text) from public, anon, authenticated;

-- New message: handed to the Edge Function, which builds and sends the
-- heads-up push. Without it set up, the push goes straight to Expo from
-- here, as it did before. Nothing goes out across a block.
create or replace function public.on_message_push()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  conv public.conversations;
  recipient uuid;
  sender_name text;
  preview text;
  payload jsonb;
  cfg private.push_settings;
begin
  select * into conv from public.conversations where id = new.conversation_id;
  recipient := case when conv.user_a = new.sender_id then conv.user_b else conv.user_a end;
  if public.is_blocked(new.sender_id, recipient) then return new; end if;

  select * into cfg from private.push_settings where id;
  if cfg.function_url is not null then
    perform net.http_post(
      url := cfg.function_url,
      body := jsonb_build_object('type', 'INSERT', 'table', 'messages', 'record', jsonb_build_object(
        'id', new.id, 'conversation_id', new.conversation_id, 'sender_id', new.sender_id, 'kind', new.kind, 'body', new.body
      )),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-boa-push-secret', cfg.secret)
    );
    return new;
  end if;

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
