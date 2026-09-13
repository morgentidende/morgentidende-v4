-- The fast-path Worker is now deployed and enqueue_media_ingest_fallback()
-- is the only supported way to create fallback jobs. Remove the temporary
-- compatibility layer that allowed the legacy Worker to INSERT directly.

revoke insert on table public.media_ingest_jobs from service_role;

drop trigger if exists media_ingest_jobs_require_fallback_marker
on public.media_ingest_jobs;

drop function if exists public.guard_media_ingest_job_insert();
