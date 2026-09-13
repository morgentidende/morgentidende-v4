create or replace function public.validate_article_media()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  is_new_publication boolean := false;
  media_error text;
begin
  if new.status <> 'published'::public.article_status then
    return new;
  end if;

  is_new_publication := tg_op = 'INSERT'
    or old.status is distinct from 'published'::public.article_status;

  if new.hero_media_id is null then
    if is_new_publication
      or (tg_op = 'UPDATE' and old.hero_media_id is not null) then
      raise exception 'published articles require an archived hero_media_id';
    end if;
    return new;
  end if;

  media_error := public.article_media_publication_error(new.hero_media_id, new.hero_url);

  if media_error is null then
    return new;
  end if;

  case media_error
    when 'hero_media_not_found' then raise exception 'hero_media_id does not reference an existing media asset';
    when 'hero_media_not_ready' then raise exception 'hero media asset must be ready before publication';
    when 'commercial_use_not_allowed' then raise exception 'hero media asset lacks required commercial/archive rights';
    when 'local_storage_not_allowed' then raise exception 'hero media asset lacks required commercial/archive rights';
    when 'missing_delivery_url' then raise exception 'hero media asset has no delivery URL';
    when 'hero_url_mismatch' then raise exception 'published hero_url must match the archived media asset delivery URL';
    when 'missing_required_attribution' then raise exception 'hero media asset requires attribution but has no credit text';
    else raise exception 'hero media validation failed: %', media_error;
  end case;
end;
$$;
