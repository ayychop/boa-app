-- Admin "Delete User": make sure deleting a sign-in account wipes the member.
--
-- The delete-user Edge Function (supabase/functions/delete-user) calls
-- auth.admin.deleteUser(). From there it's all cascades:
--   auth.users -> profiles (on delete cascade)
--   profiles   -> posts, messages, conversations (and their messages),
--                 blocks (both sides), hearts, reports they filed,
--                 casting calls, applications, push tokens, live sessions,
--                 Day One claims, split sheets and parties, invoices issued
-- Links that only point AT someone keep the row and lose the name
-- (on delete set null): a report about them, an invoice billed to them,
-- a station they added to Trending.
--
-- The migrations already create every foreign key this way. This one makes
-- it certain on the live database too: any foreign key in public that
-- points at profiles(id) or auth.users(id) and would BLOCK the delete
-- (no action / restrict, e.g. a table added in the dashboard) is rebuilt
-- as on delete cascade. Keys that already cascade or set null are left
-- alone. Safe to run more than once.
--
-- Run in the Supabase SQL editor.

begin;

do $$
declare
  fk record;
begin
  for fk in
    select c.conname,
           c.conrelid::regclass as tbl,
           pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
      and c.confdeltype in ('a', 'r') -- no action, restrict
  loop
    execute format('alter table %s drop constraint %I', fk.tbl, fk.conname);
    -- Same definition, with ON DELETE CASCADE straight after REFERENCES
    -- (before any DEFERRABLE clause, where Postgres wants it).
    execute format(
      'alter table %s add constraint %I %s',
      fk.tbl,
      fk.conname,
      regexp_replace(
        regexp_replace(fk.def, '\s+ON DELETE (NO ACTION|RESTRICT)', '', 'i'),
        '(REFERENCES\s+\S+\([^)]*\))',
        '\1 ON DELETE CASCADE'
      )
    );
    raise notice 'now cascades: %.%', fk.tbl, fk.conname;
  end loop;
end $$;

-- The four the Admin Portal promises, checked by name so a surprise shows
-- up here and not as a half-deleted member.
do $$
declare
  missing text;
begin
  select string_agg(t, ', ') into missing
  from (values
    ('profiles', 'auth.users'),
    ('posts', 'public.profiles'),
    ('messages', 'public.profiles'),
    ('blocks', 'public.profiles')
  ) as want (t, parent)
  where not exists (
    select 1
    from pg_constraint c
    where c.contype = 'f'
      and c.conrelid = ('public.' || want.t)::regclass
      and c.confrelid = want.parent::regclass
      and c.confdeltype = 'c'
  );
  if missing is not null then
    raise exception 'These tables would not be wiped with their owner: %', missing;
  end if;
end $$;

commit;
