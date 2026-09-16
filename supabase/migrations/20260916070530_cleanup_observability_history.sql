-- Remove observability rows that are no longer produced or consumed.
-- Runtime/recovery behavior is unchanged.

-- `auto_released` was success-log noise. The publication watchdog no longer
-- writes these rows; articles.status='published' is the canonical success state.
delete from public.publication_watchdog_events
where issue_type = 'auto_released';

-- The DB automation watchdog for these legacy Scheduled Task ids has been
-- retired. Its old resolved alerts no longer represent active monitoring.
delete from public.automation_watchdog_alerts
where state = 'resolved'
  and automation_id in (
    '6aa46ef2a66c8191bc0007310e83427a',
    '6aa448bb8ca48191b97259160873bbad',
    '6aa4421c4af081918b4eb3bdcb7d2a06'
  )
  and issue_type in ('scheduler_missed', 'run_stalled');

-- Keep automation_run_events for now. Its remaining external writers/readers
-- are not fully observable from the database, so retention is deferred rather
-- than guessed.
