-- Restrict the SECURITY DEFINER source-registry wrapper to service_role only.
-- The wrapper previously inherited PostgreSQL's default PUBLIC EXECUTE privilege.

revoke execute on function public.upsert_editorial_source_registry_from_metadata(jsonb) from public;
revoke execute on function public.upsert_editorial_source_registry_from_metadata(jsonb) from anon;
revoke execute on function public.upsert_editorial_source_registry_from_metadata(jsonb) from authenticated;
grant execute on function public.upsert_editorial_source_registry_from_metadata(jsonb) to service_role;
