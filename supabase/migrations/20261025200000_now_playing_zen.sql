-- BOA HUB: "Now Playing" for Zen, live.
--
--  1. profiles.status_kind gets 'zen': "In the Zen Zone: Rain · On the
--     window" while a Zen soundscape plays (alongside 'listening' for
--     BOA Radio and 'watching' for the screening room).
--  2. profiles joins the realtime publication, so the chat list, a thread's
--     header and a profile update the moment someone starts or stops
--     playing. Row level security still applies: you only hear about
--     profiles you're allowed to see.
--  3. Phones registered with a message sound this build retired (beep,
--     rimshot, laugh, trombone, boing) move to the pager ping, so their
--     pushes ring on a channel the app still has.
--
-- Run once in the Supabase dashboard > SQL editor, after
-- 20261025150000_chat_media_notifications.sql. One transaction: if any
-- statement fails, nothing changes. Until it's run, the app shows Zen as
-- "Listening to the Zen Zone: ..." instead.

begin;

alter table public.profiles drop constraint if exists profiles_status_kind_check;
alter table public.profiles add constraint profiles_status_kind_check
  check (status_kind in ('listening', 'watching', 'zen'));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;

update public.push_tokens
set sound = 'pager', updated_at = now()
where sound in ('beep', 'rimshot', 'laugh', 'trombone', 'boing');

notify pgrst, 'reload schema';

commit;
