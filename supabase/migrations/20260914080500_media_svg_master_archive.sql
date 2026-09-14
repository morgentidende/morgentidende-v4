create table if not exists public.media_source_masters (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid null references public.media_assets(id) on delete set null,
  sha256 text not null unique,
  source_mime text not null,
  byte_size bigint not null check (byte_size > 0),
  source_text text not null,
  source_provider text null,
  rights_notes text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.media_source_masters enable row level security;

comment on table public.media_source_masters is 'Private archival source masters for controlled generated media. SVG source is retained here while the public hero is a raster asset.';
comment on column public.media_source_masters.source_text is 'Original source text. Never expose through public article views.';

create index if not exists media_source_masters_asset_id_idx on public.media_source_masters(asset_id);

create or replace function public.classify_media_ingest_failure(p_http_status integer, p_result jsonb)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_http_status, 0) >= 500 then 'transient'
    when coalesce(p_result->>'error', '') = 'source_fetch_failed'
      and coalesce((p_result->>'status')::integer, 0) in (408, 425, 429) then 'transient'
    when coalesce(p_result->>'error', '') = 'source_fetch_failed'
      and coalesce((p_result->>'status')::integer, 0) >= 500 then 'transient'
    else 'permanent'
  end;
$$;
