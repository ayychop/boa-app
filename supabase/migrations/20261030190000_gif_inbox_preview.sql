-- The chat list says "[GIF]" for a GIF, not the address it is stored as.
create or replace function public.on_message_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.conversations c
  set last_message_at = new.created_at,
      last_message_preview = left(case
        when new.view_once and new.kind = 'image' then '📷 View once photo'
        when new.view_once and new.kind = 'video' then '🎬 View once video'
        when new.kind = 'image' then coalesce('📷 ' || nullif(btrim(new.body), ''), '📷 Photo')
        when new.kind = 'video' then coalesce('🎬 ' || nullif(btrim(new.body), ''), '🎬 Video')
        when new.kind = 'voice' then '🎙️ Voice note'
        when new.kind = 'gif' then '[GIF]'
        else new.body
      end, 140),
      last_sender_id = new.sender_id,
      a_last_read_at = case when c.user_a = new.sender_id then new.created_at else c.a_last_read_at end,
      b_last_read_at = case when c.user_b = new.sender_id then new.created_at else c.b_last_read_at end
  where c.id = new.conversation_id;
  return new;
end;
$$;

-- Conversations that already show a GIF's address are tidied up too.
update public.conversations
set last_message_preview = '[GIF]'
where last_message_preview ~* '^https://(media[0-9]*\.giphy\.com|i\.giphy\.com)/';
