-- Chat Appearance and call ringtones: two personal settings on the profile,
-- so they follow a member to every phone they sign in on.
--
-- Run in the Supabase SQL editor after 20261027120000. Safe to run again.
--
-- profiles.chat_theme: the colour and glass of your own message bubbles,
-- { "color": "#RRGGBB", "transparency": 0..1 }, or null for the chat vibe's
-- own bubbles (src/chat/bubbleTheme.js).
-- profiles.ringtone_preference: which ringtone an incoming call plays
-- (src/calls/ringtone.js).
--
-- Members can update their own row already (profiles_guard leaves these
-- columns alone); the checks keep anything else out.

alter table public.profiles add column if not exists chat_theme jsonb;
alter table public.profiles add column if not exists ringtone_preference text not null default 'hiphop';

alter table public.profiles drop constraint if exists profiles_chat_theme_shape;
alter table public.profiles add constraint profiles_chat_theme_shape check (
  chat_theme is null
  or (
    jsonb_typeof(chat_theme) = 'object'
    and (chat_theme ->> 'color') ~ '^#[0-9A-Fa-f]{6}$'
    and jsonb_typeof(chat_theme -> 'transparency') = 'number'
    and (chat_theme ->> 'transparency')::numeric between 0 and 1
  )
);

alter table public.profiles drop constraint if exists profiles_ringtone_preference_known;
alter table public.profiles add constraint profiles_ringtone_preference_known check (
  ringtone_preference in ('hiphop', 'rnb', 'afrobeats', 'bashment')
);
