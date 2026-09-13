create or replace function public.guard_media_ingest_job_insert()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not (coalesce(new.result, '{}'::jsonb) ? 'queued_after_fast_path_failure') then
    raise exception 'direct_media_queue_insert_forbidden_use_ingest_fast_path';
  end if;
  return new;
end;
$$;

drop trigger if exists media_ingest_jobs_require_fallback_marker on public.media_ingest_jobs;

create trigger media_ingest_jobs_require_fallback_marker
before insert on public.media_ingest_jobs
for each row execute function public.guard_media_ingest_job_insert();

-- Transitional compatibility for the currently deployed Worker, which still
-- writes validated transient failures directly to the queue. Bare queue inserts
-- remain blocked by the trigger above. Once the new Worker is deployed, direct
-- INSERT can be revoked again and only enqueue_media_ingest_fallback() retained.
grant insert on table public.media_ingest_jobs to service_role;
