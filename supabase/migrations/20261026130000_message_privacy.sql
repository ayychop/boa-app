-- BOA HUB: who can message you.
--
-- Run once in the Supabase dashboard > SQL editor, after
-- 20261026120000_hearts.sql. One transaction. Safe to run again.
--
-- profiles.messages_from:
--   'everyone' (the default): anyone on the Hub can start a chat with you.
--   'chatted': only people you already have a conversation with; nobody
--              new can start one.
--   'nobody':  nobody can message you. Your old threads stay readable, but
--              the other person can't send anything more until you change
--              this. You can still message people yourself.
-- Enforced here, on start_conversation and on every message sent, so no
-- app or API call can get round it.

begin;

alter table public.profiles add column if not exists messages_from text not null default 'everyone';
alter table public.profiles drop constraint if exists profiles_messages_from_check;
alter table public.profiles add constraint profiles_messages_from_check check (messages_from in ('everyone', 'chatted', 'nobody'));

-- Whether `target` takes messages from the signed-in person right now.
create or replace function public.accepts_messages(target uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case coalesce((select messages_from from public.profiles where id = target), 'everyone')
    when 'everyone' then true
    when 'nobody' then false
    else exists (
      select 1 from public.conversations c
      where c.user_a = least((select auth.uid()), target)
        and c.user_b = greatest((select auth.uid()), target)
        and c.last_message_at is not null
    )
  end;
$$;
grant execute on function public.accepts_messages(uuid) to authenticated;

create or replace function public.start_conversation(other uuid)
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
  -- An existing thread always opens (its history is yours too); whether
  -- you can still send is the messages policy's call.
  if conv is not null then return conv; end if;
  if not exists (select 1 from public.profiles where id = other and visible_on_hub) then
    raise exception 'profile not available';
  end if;
  if not public.accepts_messages(other) then
    raise exception 'They aren''t taking new messages right now';
  end if;
  insert into public.conversations (user_a, user_b) values (a, b) returning id into conv;
  return conv;
end;
$$;

drop policy if exists "members send messages" on public.messages;
create policy "members send messages" on public.messages
  for insert to authenticated with check (
    sender_id = (select auth.uid())
    and not public.is_banned()
    and public.is_member(conversation_id)
    and not exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (
          public.is_blocked(c.user_a, c.user_b)
          or not public.accepts_messages(case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end)
        )
    )
  );

notify pgrst, 'reload schema';

commit;
