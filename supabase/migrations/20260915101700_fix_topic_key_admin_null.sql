-- Treat an unset admin correction flag as false.
create or replace function public.enforce_active_magazine_topic_key()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_admin boolean := coalesce(current_setting('morgentidende.topic_key_admin', true) = '1', false);
begin
  if new.kind is distinct from 'magazine'::public.article_kind then
    return new;
  end if;

  if new.status in ('scheduled'::public.article_status, 'published'::public.article_status)
     and nullif(trim(new.topic_key), '') is null then
    raise exception 'magazine_topic_key_required';
  end if;

  if tg_op = 'UPDATE'
     and old.kind = 'magazine'::public.article_kind
     and old.status in ('scheduled'::public.article_status, 'published'::public.article_status)
     and new.kind = 'magazine'::public.article_kind
     and new.status in ('scheduled'::public.article_status, 'published'::public.article_status)
     and new.topic_key is distinct from old.topic_key
     and not v_admin then
    raise exception 'magazine_topic_key_immutable';
  end if;

  return new;
end;
$$;
