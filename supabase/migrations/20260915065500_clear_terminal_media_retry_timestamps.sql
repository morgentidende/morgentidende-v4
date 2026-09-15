-- Terminal media-ingest jobs must not advertise a future retry.
-- The Worker now retries only transient source-fetch failures (408/425/429/5xx).
-- Terminal jobs therefore have no next attempt timestamp.
alter table public.media_ingest_jobs
  alter column next_attempt_at drop not null;

update public.media_ingest_jobs
set next_attempt_at = null,
    updated_at = now()
where status in ('done','failed')
  and next_attempt_at is not null;
