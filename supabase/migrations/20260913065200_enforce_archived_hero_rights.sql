create or replace function public.validate_article_media()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  asset public.media_assets%rowtype;
  is_new_publication boolean := false;
begin
  if new.status <> 'published'::public.article_status then
    return new;
  end if;

  is_new_publication := tg_op = 'INSERT'
    or old.status is distinct from 'published'::public.article_status;

  -- Existing published legacy articles without hero_media_id are grandfathered
  -- until they are migrated. New publications may not bypass the media archive.
  if new.hero_media_id is null then
    if is_new_publication
      or (tg_op = 'UPDATE' and old.hero_media_id is not null) then
      raise exception 'published articles require an archived hero_media_id';
    end if;
    return new;
  end if;

  select * into asset
  from public.media_assets
  where id = new.hero_media_id;

  if not found then
    raise exception 'hero_media_id does not reference an existing media asset';
  end if;
  if asset.status <> 'ready' then
    raise exception 'hero media asset must be ready before publication';
  end if;
  if not asset.commercial_use_allowed or not asset.local_storage_allowed then
    raise exception 'hero media asset lacks required commercial/archive rights';
  end if;
  if asset.delivery_url is null or btrim(asset.delivery_url) = '' then
    raise exception 'hero media asset has no delivery URL';
  end if;
  if new.hero_url is distinct from asset.delivery_url then
    raise exception 'published hero_url must match the archived media asset delivery URL';
  end if;
  if asset.attribution_required and (asset.credit_text is null or btrim(asset.credit_text) = '') then
    raise exception 'hero media asset requires attribution but has no credit text';
  end if;

  return new;
end;
$function$;

drop trigger if exists articles_validate_media_before_write on public.articles;
create trigger articles_validate_media_before_write
before insert or update of status, hero_media_id, hero_url on public.articles
for each row execute function public.validate_article_media();
