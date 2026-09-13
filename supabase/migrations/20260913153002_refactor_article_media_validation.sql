create or replace function public.raise_article_media_publication_error(p_error text)
returns void
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_error is null then
    return;
  end if;

  case p_error
    when 'missing_hero_media_id' then raise exception 'published articles require an archived hero_media_id';
    when 'hero_media_not_found' then raise exception 'hero_media_id does not reference an existing media asset';
    when 'hero_media_not_ready' then raise exception 'hero media asset must be ready before publication';
    when 'commercial_use_not_allowed' then raise exception 'hero media asset lacks required commercial/archive rights';
    when 'local_storage_not_allowed' then raise exception 'hero media asset lacks required commercial/archive rights';
    when 'missing_delivery_url' then raise exception 'hero media asset has no delivery URL';
    when 'hero_url_mismatch' then raise exception 'published hero_url must match the archived media asset delivery URL';
    when 'missing_required_attribution' then raise exception 'hero media asset requires attribution but has no credit text';
    else raise exception 'hero media validation failed: %', p_error;
  end case;
end;
$$;

revoke all on function public.raise_article_media_publication_error(text) from public, anon, authenticated;
grant execute on function public.raise_article_media_publication_error(text) to service_role;

create or replace function public.validate_article_media()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  media_error text;
begin
  if new.status <> 'published'::public.article_status then
    return new;
  end if;

  -- Preserve compatibility for legacy published rows that already had no archived hero.
  -- Any new publication, newly removed hero, or changed hero still goes through strict validation.
  if new.hero_media_id is null
     and tg_op = 'UPDATE'
     and old.status = 'published'::public.article_status
     and old.hero_media_id is null then
    return new;
  end if;

  media_error := public.article_media_publication_error(new.hero_media_id, new.hero_url);
  perform public.raise_article_media_publication_error(media_error);

  return new;
end;
$$;
