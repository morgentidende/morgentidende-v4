-- Media fallback is now owned entirely by the media-ingest worker.
-- The previous BEFORE UPDATE trigger competed with worker state transitions and
-- could leave jobs terminal after candidate 1 even when fallback_candidates existed.

drop trigger if exists trg_media_ingest_fail_fast_or_advance on public.media_ingest_jobs;

-- Keep the historical function in place for migration/backward-compatibility
-- inspection, but it is no longer attached to the jobs table.

comment on function public.media_ingest_fail_fast_or_advance() is
  'Legacy fallback trigger function. Detached 2026-09-16; media-ingest worker is the sole fallback state-machine owner.';
