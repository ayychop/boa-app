-- BOA HUB: The Cipher comes out.
--
-- Run once in the Supabase dashboard > SQL editor, after
-- 20261026130000_message_privacy.sql. One transaction. Safe to run again.
--
-- The live rooms had no voice yet, and a silent room makes the app feel
-- broken, so the feature is gone from the app and from here:
--  - live_sessions and session_participants are dropped, with their
--    policies, triggers and realtime publication entries.
--  - The helper functions that only served them are dropped.
--  - export_my_data() is rebuilt without the rooms you hosted, so the data
--    export keeps working once the table is gone.
-- Posts, hearts, Day One, Splits and message privacy are untouched.

begin;

drop table if exists public.session_participants cascade;
drop table if exists public.live_sessions cascade;

drop function if exists public.session_participants_guard() cascade;
drop function if exists public.on_live_session_end() cascade;
drop function if exists public.hosts_session(uuid) cascade;

-- The GDPR export, as in 20261026120000_hearts.sql minus the live rooms.
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
    'day_one', coalesce((select jsonb_agg(to_jsonb(d)) from public.day_one_claims d where d.user_id = (select auth.uid())), '[]'),
    'split_sheets', coalesce((select jsonb_agg(to_jsonb(s)) from public.split_sheets s where public.on_split_sheet(s.id)), '[]'),
    'invoices', coalesce((select jsonb_agg(to_jsonb(i)) from public.invoices i where i.issuer_id = (select auth.uid())), '[]'),
    'hearts_given', coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at) from public.hearts h where h.liker_id = (select auth.uid())), '[]')
  );
$$;

notify pgrst, 'reload schema';

commit;
