do $do$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname = 'morgentidende-automation-watchdog'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end
$do$;

update public.automation_watchdog_alerts
set state = 'resolved',
    resolved_at = coalesce(resolved_at, clock_timestamp()),
    details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
      'resolved_reason', 'retired_obsolete_event_watchdog',
      'resolved_source', 'migration'
    )
where state = 'open'
  and automation_id in (
    '6aa46ef2a66c8191bc0007310e83427a',
    '6aa448bb8ca48191b97259160873bbad',
    '6aa4421c4af081918b4eb3bdcb7d2a06'
  )
  and issue_type in ('scheduler_missed', 'run_stalled');

comment on function public.run_automation_watchdog() is
  'Legacy Scheduled Task event watchdog. Its cron was retired after automation_run_events stopped representing the active news/magazine runtime. Keep temporarily for compatibility; do not use as current news health.';
