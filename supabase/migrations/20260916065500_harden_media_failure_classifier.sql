-- Reduce legacy/public RPC surface for the media failure classifier.
-- The classifier remains available to trusted backend roles and keeps the
-- same behavior; this migration only hardens execution context and grants.

create or replace function public.classify_media_ingest_failure(
  p_http_status integer,
  p_result jsonb
)
returns text
language plpgsql
immutable
set search_path = 'public'
as $function$
declare
  v_error text := coalesce(p_result->>'error', '');
  v_status integer := 0;
begin
  if coalesce(p_result->>'status', '') ~ '^\d+$' then
    v_status := (p_result->>'status')::integer;
  end if;

  if coalesce(p_http_status, 0) >= 500 then
    return 'transient';
  end if;

  if v_error = 'source_fetch_failed'
     and (v_status in (408, 425, 429) or v_status >= 500) then
    return 'transient';
  end if;

  return 'permanent';
end;
$function$;

revoke all on function public.classify_media_ingest_failure(integer, jsonb) from public;
revoke execute on function public.classify_media_ingest_failure(integer, jsonb) from anon, authenticated;
grant execute on function public.classify_media_ingest_failure(integer, jsonb) to service_role;
