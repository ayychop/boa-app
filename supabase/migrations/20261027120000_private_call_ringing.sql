-- Private call ringing.
--
-- BOA video calls ring over Supabase Realtime broadcast, one inbox per
-- member: the topic boa-call:<user id> (src/calls/signaling.js). Those were
-- public channels, so anyone who knew a member's id could listen in, see
-- who was calling them and pick up the call's id, which is also its Agora
-- channel. The app now joins and sends on PRIVATE channels, which Realtime
-- checks against these policies on realtime.messages:
--
--   listen (select): only on your own inbox.
--   send (insert):   to any member's inbox, as long as you're signed in,
--                    not banned, and neither of you has blocked the other.
--
-- Realtime keeps private and public channels apart even when the names
-- match, so the old public inbox carries nothing now.
--
-- Run in the Supabase SQL editor, before installing the build that uses
-- it: until then the new app's inbox is refused and calls don't ring.
-- Other Realtime features (presence, typing, the Hub's live lists) stay on
-- public channels and are unaffected; leave Realtime's "Allow public
-- access" setting on.

begin;

-- The member whose inbox a topic is, or null for any other topic. Checks
-- the shape before casting, so a strange topic is refused, not an error.
create or replace function public.call_inbox_owner(topic text)
returns uuid
language sql immutable set search_path = ''
as $$
  select case
    when topic ~ '^boa-call:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then substr(topic, 10)::uuid
  end;
$$;

grant execute on function public.call_inbox_owner(text) to authenticated;

alter table realtime.messages enable row level security;

drop policy if exists "call inbox: listen to your own" on realtime.messages;
create policy "call inbox: listen to your own" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.call_inbox_owner((select realtime.topic())) = (select auth.uid())
  );

drop policy if exists "call inbox: ring members you can reach" on realtime.messages;
create policy "call inbox: ring members you can reach" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and public.call_inbox_owner((select realtime.topic())) is not null
    and not public.is_banned()
    and not public.is_blocked((select auth.uid()), public.call_inbox_owner((select realtime.topic())))
  );

commit;
