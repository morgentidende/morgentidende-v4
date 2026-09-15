create table if not exists public.live_metric_poll_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  stage text not null,
  live_center_id uuid null references public.live_centers(id) on delete cascade,
  adapter_id text null,
  status text not null default 'ok',
  detail jsonb not null default '{}'::jsonb
);

create index if not exists live_metric_poll_events_created_idx
  on public.live_metric_poll_events(created_at desc);
create index if not exists live_metric_poll_events_center_idx
  on public.live_metric_poll_events(live_center_id, created_at desc);

revoke all on public.live_metric_poll_events from anon, authenticated;
grant select, insert on public.live_metric_poll_events to service_role;
