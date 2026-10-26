-- The welcome tour: whether a member has seen it.
--
-- Run in the Supabase SQL editor after 20261026210000. Safe to run again.
--
-- profiles.has_seen_onboarding starts false and the app sets it once the
-- tour's "Let's Go" (or Skip) is tapped, so the tour shows once per member,
-- on whichever phone they sign in on first. Members can update their own
-- row already (profiles_guard leaves this column alone).

alter table public.profiles add column if not exists has_seen_onboarding boolean not null default false;
