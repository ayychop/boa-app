-- Google Play compliance: user generated content safety, account deletion.
--
--  1. Reports can name a post (not only a person or a message), and the
--     reason list grows (violence, self harm, illegal). The reporter can see
--     what they reported; moderators see it all through the Admin Portal.
--  2. moderation_events: a log of what the automatic content check (the
--     moderate-content Edge Function) refused. It holds the person, what
--     kind of thing and which categories, never the content itself.
--  3. Nobody posts or messages without having accepted the current Terms of
--     Service and Community Guidelines: the database refuses a post or a
--     message from an account whose recorded acceptance
--     (profiles.terms_version, written by the app when the person agrees) is
--     older than 2026-11-04. The app asks once, before the first post,
--     message or upload (src/safety/consent.js).
--
-- ORDER: run this after the app version that asks for the agreement is live.
-- Earlier builds cannot record it, so their users would be refused until they
-- update. Safe to run twice.

-- ------------------------------------------------------------------ reports
alter table public.reports add column if not exists post_id uuid references public.posts (id) on delete set null;
alter table public.reports add column if not exists content_type text;
alter table public.reports add column if not exists content_excerpt text check (char_length(content_excerpt) <= 2000);

alter table public.reports drop constraint if exists reports_content_type_check;
alter table public.reports
  add constraint reports_content_type_check check (content_type is null or content_type in ('profile', 'message', 'post'));

alter table public.reports drop constraint if exists reports_reason_check;
alter table public.reports
  add constraint reports_reason_check check (
    reason in ('spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm', 'illegal', 'scam', 'underage', 'impersonation', 'other')
  );

create index if not exists reports_post_idx on public.reports (post_id) where post_id is not null;

-- A report names a person, a message or a post.
drop policy if exists "file a report" on public.reports;
create policy "file a report" on public.reports
  for insert to authenticated with check (
    reporter_id = (select auth.uid())
    and status = 'open'
    and (reported_user_id is not null or message_id is not null or post_id is not null)
  );

-- ------------------------------------------------------- moderation events
create table if not exists public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('text', 'image')),
  -- Where it was headed: 'post', 'message', 'avatar', 'profile', 'casting'.
  surface text,
  categories text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists moderation_events_user_idx on public.moderation_events (user_id, created_at desc);
alter table public.moderation_events enable row level security;
-- No policies: only the service role (the Edge Function, the Admin Portal's
-- server side) reads or writes it.
revoke all on public.moderation_events from public, anon, authenticated;

-- ------------------------------------------------------- terms before UGC
create or replace function public.require_accepted_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- posts have an author_id, messages a sender_id; reading the row as json suits both.
  author uuid := coalesce(to_jsonb(new) ->> 'author_id', to_jsonb(new) ->> 'sender_id')::uuid;
begin
  -- ISO dates compare correctly as text. Raise this date when the Terms change.
  if not exists (
    select 1 from public.profiles p
    where p.id = author and p.terms_accepted_at is not null and p.terms_version >= '2026-11-04'
  ) then
    raise exception 'Accept the Terms of Service and Community Guidelines first.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists posts_require_terms on public.posts;
create trigger posts_require_terms before insert on public.posts
  for each row execute function public.require_accepted_terms();

drop trigger if exists messages_require_terms on public.messages;
create trigger messages_require_terms before insert on public.messages
  for each row execute function public.require_accepted_terms();
