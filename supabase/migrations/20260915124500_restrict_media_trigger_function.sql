-- Trigger functions should not be executable through PUBLIC/PostgREST.
-- Keep explicit access for the DB owner and service-role worker path.

revoke all on function public.media_ingest_fail_fast_or_advance() from public, anon, authenticated;
grant execute on function public.media_ingest_fail_fast_or_advance() to postgres, service_role;
