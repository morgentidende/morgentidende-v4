create table if not exists public.live_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  live_center_id uuid not null references public.live_centers(id) on delete cascade,
  adapter_id text not null,
  fetched_at timestamptz not null default now(),
  source_published_at timestamptz null,
  source_name text null,
  source_url text null,
  raw_hash text not null,
  metrics jsonb not null default '{}'::jsonb,
  validation_status text not null default 'ok',
  validation_errors jsonb not null default '[]'::jsonb,
  projected boolean not null default false,
  created_at timestamptz not null default now(),
  unique (live_center_id, adapter_id, raw_hash)
);

create index if not exists live_metric_snapshots_center_fetched_idx
  on public.live_metric_snapshots(live_center_id, fetched_at desc);

create or replace function public.apply_livecenter_metric_snapshot(
  p_live_center_id uuid,
  p_adapter_id text,
  p_raw_hash text,
  p_metrics jsonb,
  p_source_name text,
  p_source_url text,
  p_source_published_at timestamptz,
  p_source_checked_at timestamptz,
  p_validation_status text default 'ok',
  p_validation_errors jsonb default '[]'::jsonb,
  p_project boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_center public.live_centers%rowtype;
  v_snapshot_id uuid;
  v_inserted boolean := false;
  v_projected boolean := false;
  v_projection_allowed boolean := false;
begin
  select * into v_center
  from public.live_centers
  where id = p_live_center_id
  for update;

  if not found then
    raise exception 'live center not found';
  end if;

  insert into public.live_metric_snapshots (
    live_center_id, adapter_id, fetched_at, source_published_at,
    source_name, source_url, raw_hash, metrics,
    validation_status, validation_errors, projected
  ) values (
    p_live_center_id, p_adapter_id, coalesce(p_source_checked_at, now()), p_source_published_at,
    p_source_name, p_source_url, p_raw_hash, coalesce(p_metrics, '{}'::jsonb),
    coalesce(p_validation_status, 'ok'), coalesce(p_validation_errors, '[]'::jsonb), false
  )
  on conflict (live_center_id, adapter_id, raw_hash) do nothing
  returning id into v_snapshot_id;

  v_inserted := v_snapshot_id is not null;
  v_projection_allowed := (
    v_center.primary_source = p_adapter_id
    or (v_center.source_policy = 'field_primary_official' and p_adapter_id = '__composite__')
  );

  if p_project
     and coalesce(p_validation_status, 'ok') = 'ok'
     and v_projection_allowed
     and jsonb_typeof(coalesce(p_metrics, '{}'::jsonb)) = 'object'
     and p_metrics <> '{}'::jsonb
  then
    update public.live_centers
    set metrics = p_metrics,
        metrics_updated_at = coalesce(p_source_checked_at, now()),
        source_name = p_source_name,
        source_url = p_source_url,
        source_published_at = p_source_published_at,
        source_checked_at = coalesce(p_source_checked_at, now()),
        result_data = p_metrics,
        result_updated_at = coalesce(p_source_checked_at, now()),
        source_label = p_source_name,
        updated_at = now()
    where id = p_live_center_id;

    v_projected := true;

    if v_snapshot_id is not null then
      update public.live_metric_snapshots
      set projected = true
      where id = v_snapshot_id;
    end if;
  end if;

  return jsonb_build_object(
    'inserted', v_inserted,
    'snapshot_id', v_snapshot_id,
    'projected', v_projected,
    'projection_allowed', v_projection_allowed
  );
end;
$$;

revoke all on function public.apply_livecenter_metric_snapshot(uuid,text,text,jsonb,text,text,timestamptz,timestamptz,text,jsonb,boolean) from public;
grant execute on function public.apply_livecenter_metric_snapshot(uuid,text,text,jsonb,text,text,timestamptz,timestamptz,text,jsonb,boolean) to service_role;
