-- The inbox, filtered: Primary, General and Requests (src/screens/hub/ChatHome.js).
--
-- Requests: a conversation someone else started that you've never answered.
-- It stays out of your Primary inbox and sends no read receipt ("Seen")
-- until you accept it, by replying or by tapping Accept (the app holds the
-- receipt back: src/screens/hub/NewChatScreen.js). Each side has its own accepted time, so one person's
-- request is the other's ordinary chat.
--
-- Primary or General: where an accepted conversation lives in your inbox,
-- your choice, per conversation. The other person never sees it.

begin;

alter table public.conversations add column if not exists a_accepted_at timestamptz;
alter table public.conversations add column if not exists b_accepted_at timestamptz;
alter table public.conversations add column if not exists a_folder text not null default 'primary';
alter table public.conversations add column if not exists b_folder text not null default 'primary';
alter table public.conversations drop constraint if exists conversations_a_folder_check;
alter table public.conversations drop constraint if exists conversations_b_folder_check;
alter table public.conversations add constraint conversations_a_folder_check check (a_folder in ('primary', 'general'));
alter table public.conversations add constraint conversations_b_folder_check check (b_folder in ('primary', 'general'));

-- Everything that already exists is accepted on both sides where that side
-- has ever sent a message, so nobody's current chats turn into requests.
update public.conversations c
set a_accepted_at = coalesce(c.a_accepted_at, (select min(m.created_at) from public.messages m where m.conversation_id = c.id and m.sender_id = c.user_a)),
    b_accepted_at = coalesce(c.b_accepted_at, (select min(m.created_at) from public.messages m where m.conversation_id = c.id and m.sender_id = c.user_b));

-- Sending a message accepts the conversation for the sender. A trigger of
-- its own, beside on_message_insert, so neither has to know about the other.
create or replace function public.on_message_accept()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.conversations c
  set a_accepted_at = case when c.user_a = new.sender_id and c.a_accepted_at is null then new.created_at else c.a_accepted_at end,
      b_accepted_at = case when c.user_b = new.sender_id and c.b_accepted_at is null then new.created_at else c.b_accepted_at end
  where c.id = new.conversation_id
    and ((c.user_a = new.sender_id and c.a_accepted_at is null) or (c.user_b = new.sender_id and c.b_accepted_at is null));
  return new;
end;
$$;

drop trigger if exists messages_accept on public.messages;
create trigger messages_accept after insert on public.messages
for each row execute function public.on_message_accept();

-- Accept a request without replying.
create or replace function public.accept_conversation(conv uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or not public.is_member(conv) then
    raise exception 'That conversation is no longer available.' using errcode = 'P0002';
  end if;
  update public.conversations
  set a_accepted_at = case when user_a = me then coalesce(a_accepted_at, now()) else a_accepted_at end,
      b_accepted_at = case when user_b = me then coalesce(b_accepted_at, now()) else b_accepted_at end
  where id = conv;
end;
$$;
revoke all on function public.accept_conversation(uuid) from public, anon;
grant execute on function public.accept_conversation(uuid) to authenticated;

-- Move a conversation to Primary or General, on your side only.
create or replace function public.set_conversation_folder(conv uuid, folder text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if folder not in ('primary', 'general') then
    raise exception 'Unknown folder.' using errcode = '22023';
  end if;
  if me is null or not public.is_member(conv) then
    raise exception 'That conversation is no longer available.' using errcode = 'P0002';
  end if;
  update public.conversations
  set a_folder = case when user_a = me then folder else a_folder end,
      b_folder = case when user_b = me then folder else b_folder end
  where id = conv;
end;
$$;
revoke all on function public.set_conversation_folder(uuid, text) from public, anon;
grant execute on function public.set_conversation_folder(uuid, text) to authenticated;

commit;
