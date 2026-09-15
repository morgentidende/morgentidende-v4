-- Generic LiveCenter contract: story configuration is data; renderer/schema types stay in code.
alter table public.live_centers
  add column if not exists kind text,
  add column if not exists schema text,
  add column if not exists renderer text,
  add column if not exists ui jsonb not null default '{}'::jsonb,
  add column if not exists metrics jsonb not null default '{}'::jsonb,
  add column if not exists source_policy text,
  add column if not exists source_name text,
  add column if not exists source_published_at timestamptz,
  add column if not exists source_checked_at timestamptz,
  add column if not exists metrics_updated_at timestamptz;

-- Backfill existing centers without hardcoding story slugs.
update public.live_centers
set kind = coalesce(
      kind,
      result_data->>'kind',
      case
        when jsonb_typeof(result_data->'parties') = 'array' then 'election'
        when result_data ? 'deaths_found' or result_data ? 'missing' or result_data ? 'injured' then 'disaster'
        else 'generic'
      end
    ),
    schema = coalesce(
      schema,
      case
        when jsonb_typeof(result_data->'parties') = 'array' then 'election_results.v1'
        when result_data ? 'deaths_found' or result_data ? 'missing' or result_data ? 'injured' then 'casualties.v1'
        else 'key_values.v1'
      end
    ),
    renderer = coalesce(
      renderer,
      case
        when jsonb_typeof(result_data->'parties') = 'array' then 'election_table'
        when result_data ? 'deaths_found' or result_data ? 'missing' or result_data ? 'injured' then 'stat_list'
        else 'headline_only'
      end
    ),
    metrics = case when metrics = '{}'::jsonb then result_data else metrics end,
    source_name = coalesce(source_name, nullif(split_part(coalesce(source_label, ''), E'\n', 1), '')),
    metrics_updated_at = coalesce(metrics_updated_at, result_updated_at),
    source_checked_at = coalesce(source_checked_at, result_updated_at),
    source_policy = coalesce(
      source_policy,
      case
        when jsonb_typeof(result_data->'parties') = 'array' then 'official_election_authority'
        when result_data ? 'deaths_found' or result_data ? 'missing' or result_data ? 'injured' then 'single_primary_official'
        else 'desk_manual'
      end
    ),
    ui = case
      when ui <> '{}'::jsonb then ui
      when jsonb_typeof(result_data->'parties') = 'array' then jsonb_build_object(
        'feed_kicker', 'LIVE',
        'feed_title', 'Seneste fra valget',
        'metrics_kicker', 'RESULTAT',
        'metrics_title', 'Lige nu',
        'followups_label', 'Følg valget',
        'expand_open', 'Læs hele opdateringen',
        'expand_close', 'Skjul opdateringen'
      )
      else jsonb_build_object(
        'feed_kicker', 'LIVE',
        'feed_title', 'Seneste udvikling',
        'metrics_kicker', 'STATUS',
        'metrics_title', 'Lige nu',
        'followups_label', 'Baggrund',
        'expand_open', 'Læs hele opdateringen',
        'expand_close', 'Skjul opdateringen'
      )
    end;

create or replace view public.v4_public_live_centers as
select
  id,
  slug,
  label,
  title,
  deck,
  status,
  starts_at,
  ends_at,
  key_points,
  result_data,
  result_updated_at,
  source_label,
  source_url,
  updated_at,
  story_cluster_id,
  kind,
  schema,
  renderer,
  ui,
  metrics,
  source_policy,
  source_name,
  source_published_at,
  source_checked_at,
  metrics_updated_at
from public.live_centers
where homepage_active = true
  and status = any (array['scheduled'::text, 'live'::text])
  and starts_at <= now()
  and (ends_at is null or ends_at > now());
