-- A ready Cloudflare R2 hero must represent a real internal archive.
-- Existing published legacy hotlinks are grandfathered in place, but they
-- cannot be used for a new publication attempt.

alter table public.media_assets
  add column if not exists legacy_unarchived boolean not null default false;

-- Correct locally-owned static heroes that were historically mislabeled as R2.
update public.media_assets
set storage_provider = 'site_static',
    updated_at = now()
where status = 'ready'
  and storage_provider = 'cloudflare_r2'
  and storage_key is null
  and sha256 is null
  and delivery_url like 'https://morgentidende.dk/heroes/%';

-- Grandfather remaining historical R2-labeled rows that have no archive proof.
-- These rows stay usable by already-published articles, but the publication
-- gate below rejects them for any future release/re-release.
update public.media_assets
set legacy_unarchived = true,
    updated_at = now()
where status = 'ready'
  and storage_provider = 'cloudflare_r2'
  and (
    storage_bucket is null
    or storage_key is null
    or sha256 is null
    or delivery_url is null
    or delivery_url not like 'https://media.morgentidende.dk/%'
  );

alter table public.media_assets
  drop constraint if exists media_assets_ready_r2_archive_chk;

alter table public.media_assets
  add constraint media_assets_ready_r2_archive_chk
  check (
    status <> 'ready'
    or storage_provider <> 'cloudflare_r2'
    or legacy_unarchived
    or (
      storage_bucket is not null
      and btrim(storage_bucket) <> ''
      and storage_key is not null
      and btrim(storage_key) <> ''
      and sha256 is not null
      and btrim(sha256) <> ''
      and delivery_url like 'https://media.morgentidende.dk/%'
    )
  );

-- Grandfathering is migration-only. New rows cannot self-declare that they are
-- legacy, and existing non-legacy rows cannot be changed into legacy rows.
create or replace function public.guard_media_legacy_unarchived()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.legacy_unarchived then
      raise exception 'legacy_unarchived_is_migration_only';
    end if;
  elsif new.legacy_unarchived and not old.legacy_unarchived then
    raise exception 'legacy_unarchived_is_migration_only';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_media_legacy_unarchived on public.media_assets;
create trigger trg_guard_media_legacy_unarchived
before insert or update of legacy_unarchived on public.media_assets
for each row
execute function public.guard_media_legacy_unarchived();

-- Publication remains cheap: no R2 API call in the watchdog. Database archive
-- evidence is sufficient here; physical object verification belongs at ingest/audit.
create or replace function public.article_media_publication_error(
  p_media_id uuid,
  p_hero_url text
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  asset public.media_assets%rowtype;
begin
  if p_media_id is null then
    return 'missing_hero_media_id';
  end if;

  select * into asset
  from public.media_assets
  where id = p_media_id;

  if not found then return 'hero_media_not_found'; end if;
  if asset.status <> 'ready' then return 'hero_media_not_ready'; end if;
  if not asset.commercial_use_allowed then return 'commercial_use_not_allowed'; end if;
  if not asset.local_storage_allowed then return 'local_storage_not_allowed'; end if;
  if asset.legacy_unarchived then return 'hero_not_archived'; end if;
  if asset.delivery_url is null or btrim(asset.delivery_url) = '' then return 'missing_delivery_url'; end if;
  if p_hero_url is distinct from asset.delivery_url then return 'hero_url_mismatch'; end if;
  if asset.attribution_required and (asset.credit_text is null or btrim(asset.credit_text) = '') then
    return 'missing_required_attribution';
  end if;

  return null;
end;
$$;
