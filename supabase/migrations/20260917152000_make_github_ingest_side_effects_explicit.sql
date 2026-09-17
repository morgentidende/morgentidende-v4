-- GitHub publish ingestion is the sole owner of two insert-only side effects:
-- discovery audit capture and initial media enqueue. Move both out of generic
-- public.articles AFTER INSERT triggers and into the explicit RPC transaction.
--
-- The existing ingest implementation is retained as an internal core to avoid
-- duplicating its mature validation/idempotency logic. The public RPC name stays
-- unchanged for the Edge bridge.

alter function public.ingest_github_publish_payload(jsonb)
  rename to ingest_github_publish_payload_core;

revoke all on function public.ingest_github_publish_payload_core(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.enqueue_github_bridge_media_for_article(p_article_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.articles%rowtype;
  v_existing_job uuid;
  v_source_url text;
  v_rights jsonb;
  v_candidates jsonb;
  v_first jsonb;
  v_fallbacks jsonb := '[]'::jsonb;
  v_payload jsonb;
  v_enqueue_error text;
  v_job_id uuid;
begin
  select * into a
  from public.articles
  where id = p_article_id;

  if not found or a.created_by <> 'chatgpt_scheduled_github_bridge' then
    return null;
  end if;

  -- GitHub queue replay is idempotent. Any previous media job proves that the
  -- initial media side effect already ran; retries/recovery are owned by Media Worker.
  select j.id into v_existing_job
  from public.media_ingest_jobs j
  where j.article_id = a.id
  order by j.created_at
  limit 1;

  if v_existing_job is not null then
    return v_existing_job;
  end if;

  v_rights := coalesce(a.editorial_metadata->'hero_rights', '{}'::jsonb);
  v_candidates := coalesce(a.editorial_metadata->'hero_candidates', '[]'::jsonb);

  if jsonb_typeof(v_candidates) = 'array' and jsonb_array_length(v_candidates) > 0 then
    v_first := v_candidates->0;
    v_source_url := nullif(v_first->>'source_url','');

    if v_source_url is null then
      v_enqueue_error := 'enqueue_missing_source_url';
    elsif not coalesce((v_first->>'commercial_use_allowed')::boolean, false)
       or not coalesce((v_first->>'local_storage_allowed')::boolean, false) then
      v_enqueue_error := 'enqueue_rights_not_approved';
    else
      if jsonb_array_length(v_candidates) > 1 then
        select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
        into v_fallbacks
        from jsonb_array_elements(v_candidates) with ordinality
        where ordinality > 1 and ordinality <= 6;
      end if;

      v_payload := jsonb_strip_nulls(v_first || jsonb_build_object(
        'source_url', v_source_url,
        'fallback_candidates', v_fallbacks,
        'alt_text', coalesce(v_first->>'alt_text', a.hero_alt),
        'metadata', coalesce(v_first->'metadata','{}'::jsonb) || jsonb_build_object(
          'transport','github_pr_bridge',
          'queue_id',coalesce(a.editorial_metadata->>'github_queue_id', a.github_queue_id)
        )
      ));
    end if;
  else
    v_source_url := coalesce(nullif(a.hero_candidate_url,''), nullif(a.hero_source_url,''));

    if v_source_url is null then
      v_enqueue_error := 'enqueue_missing_source_url';
    elsif not coalesce((v_rights->>'commercial_use_allowed')::boolean, false)
       or not coalesce((v_rights->>'local_storage_allowed')::boolean, false) then
      v_enqueue_error := 'enqueue_rights_not_approved';
    else
      v_payload := jsonb_strip_nulls(jsonb_build_object(
        'source_url', v_source_url,
        'source_provider', nullif(a.editorial_metadata->>'hero_source_provider',''),
        'license_name', a.hero_license,
        'license_url', a.hero_license_url,
        'credit_text', a.hero_credit,
        'rights_notes', a.hero_candidate_note,
        'commercial_use_allowed', true,
        'local_storage_allowed', true,
        'modifications_allowed', coalesce((v_rights->>'modifications_allowed')::boolean, false),
        'attribution_required', coalesce((v_rights->>'attribution_required')::boolean, false),
        'alt_text', a.hero_alt,
        'fallback_candidates','[]'::jsonb,
        'metadata', jsonb_build_object(
          'transport','github_pr_bridge',
          'queue_id',coalesce(a.editorial_metadata->>'github_queue_id', a.github_queue_id)
        )
      ));
    end if;
  end if;

  if v_enqueue_error is not null then
    insert into public.media_ingest_jobs(
      article_id,
      payload,
      status,
      attempts,
      last_error,
      result
    ) values (
      a.id,
      jsonb_strip_nulls(jsonb_build_object(
        'source_url', v_source_url,
        'metadata', jsonb_build_object(
          'transport','github_pr_bridge',
          'queue_id',coalesce(a.editorial_metadata->>'github_queue_id', a.github_queue_id)
        )
      )),
      'failed',
      0,
      v_enqueue_error,
      jsonb_build_object(
        'terminal', true,
        'phase', 'enqueue',
        'reason', v_enqueue_error
      )
    )
    returning id into v_job_id;

    return v_job_id;
  end if;

  insert into public.media_ingest_jobs(article_id,payload)
  values(a.id,v_payload)
  returning id into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function public.enqueue_github_bridge_media_for_article(uuid)
  from public, anon, authenticated;
grant execute on function public.enqueue_github_bridge_media_for_article(uuid)
  to service_role;

create or replace function public.ingest_github_publish_payload(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_article_id uuid;
  v_candidates jsonb;
  v_run_id text;
  v_queue_id text;
begin
  v_article_id := public.ingest_github_publish_payload_core(p_payload);

  select
    coalesce(a.editorial_metadata->'discovery_audit', '[]'::jsonb),
    coalesce(
      nullif(btrim(a.editorial_metadata->>'discovery_run_id'),''),
      nullif(btrim(a.editorial_metadata->>'github_queue_id'),''),
      nullif(btrim(a.github_queue_id),''),
      a.id::text
    ),
    coalesce(
      nullif(btrim(a.editorial_metadata->>'github_queue_id'),''),
      nullif(btrim(a.github_queue_id),'')
    )
  into v_candidates, v_run_id, v_queue_id
  from public.articles a
  where a.id = v_article_id;

  if jsonb_typeof(v_candidates) = 'array' and jsonb_array_length(v_candidates) > 0 then
    perform public.record_discovery_candidate_audit(
      v_run_id,
      v_candidates,
      v_article_id,
      v_queue_id
    );
  end if;

  perform public.enqueue_github_bridge_media_for_article(v_article_id);

  return v_article_id;
end;
$$;

revoke all on function public.ingest_github_publish_payload(jsonb)
  from public, anon, authenticated;
grant execute on function public.ingest_github_publish_payload(jsonb)
  to service_role;

-- The generic table no longer owns GitHub-specific transport side effects.
drop trigger if exists articles_capture_discovery_audit on public.articles;
drop trigger if exists trg_enqueue_github_bridge_media on public.articles;

drop function if exists public.capture_article_discovery_audit();
drop function if exists public.enqueue_github_bridge_media();

comment on function public.ingest_github_publish_payload(jsonb) is
  'Canonical GitHub article-ingest transaction: validated/idempotent article core, discovery audit capture, then exactly-once initial media enqueue.';

comment on function public.enqueue_github_bridge_media_for_article(uuid) is
  'Creates the exactly-once initial Media Worker job for a GitHub-bridge article; Media Worker owns all subsequent fallback/recovery.';
