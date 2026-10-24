-- BOA Casting Board and Admin Portal. Run once in the Supabase dashboard >
-- SQL editor (after 20261024210000_boa_hub_reset.sql). One transaction: if
-- any statement fails, nothing changes. Safe to run again.
--
-- Admins: the emails in public.admin_users. An account is an admin while
-- its sign-in email is in that table AND confirmed (so nobody can claim an
-- admin email by signing up unconfirmed). public.is_admin() is the one
-- source of truth: every admin policy uses it, and the app asks it (the
-- app never has the list). Nobody can read or change admin_users from the
-- app; add or remove admins here, in the SQL editor. Members can never set
-- is_boa_star, is_featured or banned_at on themselves.
--
-- The Casting Board's rules, enforced here so no app or API call can get
-- round them:
--  - External gigs pay at least GBP 1,000 (a check constraint), are posted
--    by signed-in members as themselves, and go live once an admin
--    approves them (editing one sends it back for review).
--  - BOA Originals have no budget and skip that minimum; only admins (or
--    the SQL editor) can post them.
--  - Anyone can read live calls (the board is public on the Talent tab).
--  - You apply as yourself, once per call; a call's producer sees its
--    applications and can change only their status.
--  - Banned accounts can't message, post gigs or apply, and leave the
--    directory.

begin;

-- ------------------------------------------------------------------ admins
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  created_at timestamptz not null default now()
);
-- Locked: row level security on and no policies, so the app can't read or
-- write it at all. Only is_admin() (security definer) looks inside.
alter table public.admin_users enable row level security;
insert into public.admin_users (email) values ('ayychop@gmail.com') on conflict (email) do nothing;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.admin_users a on a.email = lower(u.email)
    where u.id = (select auth.uid())
      and u.email_confirmed_at is not null
  );
$$;

-- ---------------------------------------------------------------- profiles
-- BOA Star: a glowing gold badge an admin gives exceptional talent.
alter table public.profiles add column if not exists is_boa_star boolean not null default false;
-- Shown in the Chat Hub's Community Pulse.
alter table public.profiles add column if not exists is_featured boolean not null default false;
alter table public.profiles add column if not exists banned_at timestamptz;

create or replace function public.is_banned()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and banned_at is not null);
$$;

-- Keeps the admin-only columns admin-only: they change only for an admin
-- (or the SQL editor, which has no signed-in user).
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.is_boa_star := false;
      new.is_featured := false;
      new.banned_at := null;
    else
      new.is_boa_star := old.is_boa_star;
      new.is_featured := old.is_featured;
      new.banned_at := old.banned_at;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before insert or update on public.profiles
  for each row execute function public.profiles_guard();

drop policy if exists "admins read all profiles" on public.profiles;
drop policy if exists "admins update any profile" on public.profiles;
create policy "admins read all profiles" on public.profiles
  for select to authenticated using (public.is_admin());
create policy "admins update any profile" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Banned people leave the directory.
drop policy if exists "read visible profiles" on public.profiles;
create policy "read visible profiles" on public.profiles
  for select to authenticated using (
    (visible_on_hub or public.shares_conversation(id))
    and banned_at is null
    and not public.is_blocked((select auth.uid()), id)
  );

-- Banned people can't send messages.
drop policy if exists "members send messages" on public.messages;
create policy "members send messages" on public.messages
  for insert to authenticated with check (
    sender_id = (select auth.uid())
    and not public.is_banned()
    and public.is_member(conversation_id)
    and not exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and public.is_blocked(c.user_a, c.user_b)
    )
  );

-- ----------------------------------------------------------------- reports
drop policy if exists "admins read reports" on public.reports;
drop policy if exists "admins update reports" on public.reports;
create policy "admins read reports" on public.reports
  for select to authenticated using (public.is_admin());
create policy "admins update reports" on public.reports
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------ casting_calls
create table if not exists public.casting_calls (
  id uuid primary key default gen_random_uuid(),
  -- The member who posted it; null for BOA's own productions.
  producer_id uuid references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) between 10 and 4000),
  role_needed text not null check (char_length(role_needed) between 2 and 60),
  -- Pounds sterling. Null only for BOA Originals.
  budget_amount numeric(12, 2),
  is_boa_original boolean not null default false,
  location text not null check (char_length(location) between 2 and 120),
  is_open boolean not null default true,
  -- Live on the board once an admin approves it.
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  -- BOA maintains a premium standard: external gigs pay GBP 1,000 or more.
  constraint casting_calls_budget_minimum check (is_boa_original or (budget_amount is not null and budget_amount >= 1000)),
  -- A member's gig always has a producer; only BOA's may have none.
  constraint casting_calls_producer check (is_boa_original or producer_id is not null)
);
create index if not exists casting_calls_board_idx on public.casting_calls (is_boa_original desc, created_at desc) where is_open and approved;

-- Only admins approve; a member's new or edited gig waits for review.
create or replace function public.casting_calls_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    new.approved := false;
  end if;
  return new;
end;
$$;
drop trigger if exists casting_calls_guard on public.casting_calls;
create trigger casting_calls_guard before insert or update on public.casting_calls
  for each row execute function public.casting_calls_guard();

-- ------------------------------------------------------------- applications
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  casting_call_id uuid not null references public.casting_calls (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'submitted' check (status in ('submitted', 'shortlisted', 'declined', 'hired')),
  self_tape_url text check (self_tape_url is null or (self_tape_url ~ '^https://' and char_length(self_tape_url) <= 500)),
  cover_note text check (cover_note is null or char_length(cover_note) <= 1500),
  created_at timestamptz not null default now(),
  -- Something to look at: a self-tape, a note, or both.
  constraint applications_has_content check (self_tape_url is not null or cover_note is not null),
  constraint applications_once unique (casting_call_id, user_id)
);
create index if not exists applications_user_idx on public.applications (user_id, created_at desc);

-- True if the caller produces this call. Security definer so the
-- applications policies can ask without exposing anything else.
create or replace function public.produces_call(call uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.casting_calls c
    where c.id = call and c.producer_id = (select auth.uid())
  );
$$;

-- A producer moving an application along can change its status, nothing
-- else: the applicant's tape and note stay as they sent them.
create or replace function public.applications_status_only()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.casting_call_id <> old.casting_call_id or new.user_id <> old.user_id
     or new.self_tape_url is distinct from old.self_tape_url
     or new.cover_note is distinct from old.cover_note
     or new.created_at <> old.created_at then
    raise exception 'only the status of an application can change';
  end if;
  return new;
end;
$$;
drop trigger if exists applications_status_only on public.applications;
create trigger applications_status_only before update on public.applications
  for each row execute function public.applications_status_only();

-- ----------------------------------------------------- row level security
alter table public.casting_calls enable row level security;
alter table public.applications enable row level security;

drop policy if exists "read live calls" on public.casting_calls;
drop policy if exists "read own calls" on public.casting_calls;
drop policy if exists "post an external gig" on public.casting_calls;
drop policy if exists "edit own external gig" on public.casting_calls;
drop policy if exists "remove own external gig" on public.casting_calls;
drop policy if exists "admins read all calls" on public.casting_calls;
drop policy if exists "admins post calls" on public.casting_calls;
drop policy if exists "admins edit calls" on public.casting_calls;
drop policy if exists "admins remove calls" on public.casting_calls;
drop policy if exists "apply as yourself" on public.applications;
drop policy if exists "read own applications" on public.applications;
drop policy if exists "producers read applications" on public.applications;
drop policy if exists "producers update status" on public.applications;
drop policy if exists "withdraw own application" on public.applications;

-- Casting calls
create policy "read live calls" on public.casting_calls
  for select to anon, authenticated using (is_open and approved);
create policy "read own calls" on public.casting_calls
  for select to authenticated using (producer_id = (select auth.uid()));
create policy "post an external gig" on public.casting_calls
  for insert to authenticated with check (
    producer_id = (select auth.uid())
    and not is_boa_original
    and budget_amount >= 1000
    and not public.is_banned()
  );
create policy "edit own external gig" on public.casting_calls
  for update to authenticated
  using (producer_id = (select auth.uid()) and not is_boa_original)
  with check (producer_id = (select auth.uid()) and not is_boa_original and budget_amount >= 1000);
create policy "remove own external gig" on public.casting_calls
  for delete to authenticated using (producer_id = (select auth.uid()) and not is_boa_original);
create policy "admins read all calls" on public.casting_calls
  for select to authenticated using (public.is_admin());
create policy "admins post calls" on public.casting_calls
  for insert to authenticated with check (public.is_admin());
create policy "admins edit calls" on public.casting_calls
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins remove calls" on public.casting_calls
  for delete to authenticated using (public.is_admin());

-- Applications
create policy "apply as yourself" on public.applications
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and status = 'submitted'
    and not public.is_banned()
    and exists (select 1 from public.casting_calls c where c.id = casting_call_id and c.is_open and c.approved)
    -- Not to your own gig.
    and not public.produces_call(casting_call_id)
  );
create policy "read own applications" on public.applications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "producers read applications" on public.applications
  for select to authenticated using (public.produces_call(casting_call_id));
create policy "producers update status" on public.applications
  for update to authenticated
  using (public.produces_call(casting_call_id))
  with check (public.produces_call(casting_call_id));
create policy "withdraw own application" on public.applications
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on function public.produces_call(uuid) from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_banned() from public, anon;
grant execute on function public.produces_call(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_banned() to authenticated;

-- ---------------------------------------------------------------- the seed
-- The flagship: BOA's own production, Mind States UK. No budget shown and
-- none needed; live straight away. A fixed id, so running this again
-- changes nothing.
insert into public.casting_calls (id, producer_id, title, description, role_needed, budget_amount, is_boa_original, location, approved)
values (
  'b0a00000-0000-4000-8000-000000000001',
  null,
  'Mind States UK: Series Casting',
  'BOA Network is casting the next chapter of Mind States UK, our drama about five friends in Northwest London weighing the pull of the streets against the futures they want. We are looking for actors with truth in their delivery, whatever their experience. Send a self-tape of a one-minute monologue that means something to you, and a few lines about who you are. Every tape is watched by a real person on the team.',
  'Actor',
  null,
  true,
  'London, United Kingdom',
  true
)
on conflict (id) do nothing;

-- Live for the app straight away.
notify pgrst, 'reload schema';

commit;
