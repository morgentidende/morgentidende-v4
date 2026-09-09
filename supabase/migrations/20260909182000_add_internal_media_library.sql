create type public.media_asset_status as enum ('pending','ready','rejected','archived');

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  status public.media_asset_status not null default 'pending',
  asset_kind text not null default 'hero',

  source_url text,
  source_provider text,
  source_asset_id text,
  license_name text,
  license_url text,
  credit_text text,
  rights_notes text,
  rights_verified_at timestamptz,
  rights_expires_at timestamptz,
  commercial_use_allowed boolean not null default false,
  local_storage_allowed boolean not null default false,
  modifications_allowed boolean not null default false,
  attribution_required boolean not null default false,

  storage_provider text not null default 'cloudflare_r2',
  storage_bucket text,
  storage_key text,
  delivery_url text,
  mime_type text,
  width integer,
  height integer,
  byte_size bigint,
  sha256 text,

  alt_text text,
  created_by text not null default 'media_agent',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint media_dimensions_positive check ((width is null or width > 0) and (height is null or height > 0)),
  constraint media_byte_size_positive check (byte_size is null or byte_size > 0),
  constraint ready_media_has_delivery_url check (status <> 'ready' or delivery_url is not null),
  constraint ready_media_has_archive_rights check (status <> 'ready' or (commercial_use_allowed and local_storage_allowed))
);

create unique index media_assets_sha256_unique
  on public.media_assets(sha256)
  where sha256 is not null;
create index media_assets_status_created_idx on public.media_assets(status, created_at desc);
create index media_assets_source_idx on public.media_assets(source_provider, source_asset_id);

alter table public.media_assets enable row level security;

create policy media_assets_deny_client on public.media_assets
for all to anon, authenticated
using (false)
with check (false);

create trigger media_assets_set_updated_at
before update on public.media_assets
for each row execute function public.set_updated_at();

alter table public.articles
  add column hero_media_id uuid references public.media_assets(id) on delete set null;

create index articles_hero_media_idx on public.articles(hero_media_id)
where hero_media_id is not null;

create or replace function public.validate_article_media()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  asset public.media_assets%rowtype;
begin
  if new.status = 'published' and new.hero_media_id is not null then
    select * into asset from public.media_assets where id = new.hero_media_id;
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
  end if;
  return new;
end;
$$;

create trigger articles_validate_media_before_write
before insert or update of status, hero_media_id on public.articles
for each row execute function public.validate_article_media();

insert into public.site_settings(key, value) values
  ('media_library', jsonb_build_object(
    'storage', 'cloudflare_r2',
    'bucket', 'morgentidende-media',
    'public_base_url', 'https://media.morgentidende.dk',
    'transform_zone', 'https://morgentidende.dk',
    'transformations_enabled', false,
    'object_key_strategy', 'content_hash'
  ))
on conflict (key) do update set value = excluded.value, updated_at = now();
