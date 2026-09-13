create or replace function public.enqueue_media_ingest_fallback(
  p_article_id uuid,
  p_payload jsonb,
  p_failure jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  v_error text := coalesce(p_failure->>'error', '');
  v_http_status integer := 0;
  v_upstream_status integer := 0;
begin
  if coalesce(p_payload->>'source_url', '') = '' then
    raise exception 'source_url_required';
  end if;

  if coalesce((p_payload->>'commercial_use_allowed')::boolean, false) is not true
     or coalesce((p_payload->>'local_storage_allowed')::boolean, false) is not true then
    raise exception 'archive_rights_required';
  end if;

  if p_article_id is not null
     and not exists (select 1 from public.articles where id = p_article_id) then
    raise exception 'article_not_found';
  end if;

  if coalesce(p_failure->>'http_status', '') ~ '^\d+$' then
    v_http_status := (p_failure->>'http_status')::integer;
  end if;

  if coalesce(p_failure->>'status', '') ~ '^\d+$' then
    v_upstream_status := (p_failure->>'status')::integer;
  end if;

  if not (
    v_http_status >= 500
    or (
      v_error = 'source_fetch_failed'
      and (
        v_upstream_status in (408, 425, 429)
        or v_upstream_status >= 500
      )
    )
  ) then
    raise exception 'fallback_requires_transient_fast_path_failure';
  end if;

  insert into public.media_ingest_jobs (
    article_id,
    payload,
    result
  ) values (
    p_article_id,
    p_payload - 'article_id',
    jsonb_build_object('queued_after_fast_path_failure', p_failure)
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.enqueue_media_ingest_fallback(uuid, jsonb, jsonb) from public;
revoke all on function public.enqueue_media_ingest_fallback(uuid, jsonb, jsonb) from anon;
revoke all on function public.enqueue_media_ingest_fallback(uuid, jsonb, jsonb) from authenticated;
grant execute on function public.enqueue_media_ingest_fallback(uuid, jsonb, jsonb) to service_role;

-- The queue is fallback-only. service_role may claim/read/update jobs but may
-- not create arbitrary jobs directly and thereby bypass the synchronous ingest.
revoke insert on table public.media_ingest_jobs from service_role;

-- Retire the old generic enqueue route so callers cannot bypass fast path.
revoke execute on function public.enqueue_media_ingest_job(uuid, jsonb) from public;
revoke execute on function public.enqueue_media_ingest_job(uuid, jsonb) from anon;
revoke execute on function public.enqueue_media_ingest_job(uuid, jsonb) from authenticated;
revoke execute on function public.enqueue_media_ingest_job(uuid, jsonb) from service_role;
