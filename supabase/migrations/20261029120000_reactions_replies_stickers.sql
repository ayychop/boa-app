-- BOA HUB Chat: reactions, replies and animated stickers.
-- Run once in the Supabase dashboard > SQL editor. One transaction; safe to run again.
--
--  1. messages.reply_to: the message this one answers, in the same
--     conversation. Kept as null if that message is deleted.
--  2. messages.kind 'sticker': an animated emoji (Noto Animated Emoji).
--     The body is the emoji itself, so the chat list and the push read
--     naturally ("🔥").
--  3. message_reactions: one emoji per person per message. Either member
--     of the conversation can react to any message in it; you change or
--     take back only your own. Live over realtime.

begin;

-- --------------------------------------------------------------- replies
alter table public.messages add column if not exists reply_to uuid references public.messages (id) on delete set null;

-- A reply must answer a message in its own conversation.
create or replace function public.on_message_reply_check()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.reply_to is not null and not exists (
    select 1 from public.messages m where m.id = new.reply_to and m.conversation_id = new.conversation_id
  ) then
    new.reply_to := null;
  end if;
  return new;
end;
$$;
drop trigger if exists messages_reply_check on public.messages;
create trigger messages_reply_check before insert on public.messages
  for each row execute function public.on_message_reply_check();

-- -------------------------------------------------------------- stickers
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('text', 'image', 'video', 'voice', 'sticker'));

alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check check (
  char_length(body) <= 2000
  and case
    when kind = 'text' then char_length(btrim(body)) >= 1
    when kind = 'sticker' then char_length(body) between 1 and 16 and media_path is null
    else media_path is not null
  end
);

-- ------------------------------------------------------------- reactions
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- Copied from the message (by the trigger below), so realtime can filter by thread.
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_reactions_thread_idx on public.message_reactions (conversation_id);

-- The conversation always comes from the message, whatever the app sent.
create or replace function public.on_reaction_stamp()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  select m.conversation_id into new.conversation_id from public.messages m where m.id = new.message_id;
  new.user_id := (select auth.uid());
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists message_reactions_stamp on public.message_reactions;
create trigger message_reactions_stamp before insert or update on public.message_reactions
  for each row execute function public.on_reaction_stamp();

alter table public.message_reactions enable row level security;
-- Realtime deletes carry the whole old row, so the app knows which reaction went.
alter table public.message_reactions replica identity full;

drop policy if exists "members read reactions" on public.message_reactions;
drop policy if exists "react as yourself" on public.message_reactions;
drop policy if exists "change own reaction" on public.message_reactions;
drop policy if exists "remove own reaction" on public.message_reactions;

create policy "members read reactions" on public.message_reactions
  for select to authenticated using (public.is_member(conversation_id));
create policy "react as yourself" on public.message_reactions
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and public.is_member(conversation_id)
    and not exists (
      select 1 from public.conversations c
      where c.id = conversation_id and public.is_blocked(c.user_a, c.user_b)
    )
  );
create policy "change own reaction" on public.message_reactions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and public.is_member(conversation_id));
create policy "remove own reaction" on public.message_reactions
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.message_reactions from anon;
grant select, insert, update, delete on public.message_reactions to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end;
$$;

commit;
