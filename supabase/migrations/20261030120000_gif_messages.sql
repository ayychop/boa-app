-- GIFs in chat: a message of kind 'gif' whose body is a GIPHY media address
-- (https on giphy's own media hosts, nothing else), with its size alongside.
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('text', 'image', 'video', 'voice', 'sticker', 'gif'));

alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check check (
  char_length(body) <= 2000
  and case
    when kind = 'text' then char_length(btrim(body)) >= 1
    when kind = 'sticker' then char_length(body) between 1 and 16 and media_path is null
    when kind = 'gif' then char_length(body) between 12 and 600
      and body ~* '^https://(media[0-9]*\.giphy\.com|i\.giphy\.com)/[^[:space:]]+$'
      and media_path is null
    else media_path is not null
  end
);
