create unique index if not exists media_ingest_jobs_one_active_per_article_idx
  on public.media_ingest_jobs(article_id)
  where article_id is not null and status in ('pending','processing');

create or replace function public.enqueue_github_bridge_media()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_source_url text;
  v_rights jsonb;
  v_candidates jsonb;
  v_first jsonb;
  v_fallbacks jsonb := '[]'::jsonb;
  v_payload jsonb;
  v_enqueue_error text;
begin
  if new.created_by <> 'chatgpt_scheduled_github_bridge' then
    return new;
  end if;

  v_rights := coalesce(new.editorial_metadata->'hero_rights', '{}'::jsonb);
  v_candidates := coalesce(new.editorial_metadata->'hero_candidates', '[]'::jsonb);

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
        'alt_text', coalesce(v_first->>'alt_text', new.hero_alt),
        'metadata', coalesce(v_first->'metadata','{}'::jsonb) || jsonb_build_object(
          'transport','github_pr_bridge',
          'queue_id',new.editorial_metadata->>'github_queue_id'
        )
      ));
    end if;
  else
    v_source_url := coalesce(nullif(new.hero_candidate_url,''), nullif(new.hero_source_url,''));

    if v_source_url is null then
      v_enqueue_error := 'enqueue_missing_source_url';
    elsif not coalesce((v_rights->>'commercial_use_allowed')::boolean, false)
       or not coalesce((v_rights->>'local_storage_allowed')::boolean, false) then
      v_enqueue_error := 'enqueue_rights_not_approved';
    else
      v_payload := jsonb_strip_nulls(jsonb_build_object(
        'source_url', v_source_url,
        'source_provider', nullif(new.editorial_metadata->>'hero_source_provider',''),
        'license_name', new.hero_license,
        'license_url', new.hero_license_url,
        'credit_text', new.hero_credit,
        'rights_notes', new.hero_candidate_note,
        'commercial_use_allowed', true,
        'local_storage_allowed', true,
        'modifications_allowed', coalesce((v_rights->>'modifications_allowed')::boolean, false),
        'attribution_required', coalesce((v_rights->>'attribution_required')::boolean, false),
        'alt_text', new.hero_alt,
        'fallback_candidates','[]'::jsonb,
        'metadata', jsonb_build_object(
          'transport','github_pr_bridge',
          'queue_id',new.editorial_metadata->>'github_queue_id'
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
      new.id,
      jsonb_strip_nulls(jsonb_build_object(
        'source_url', v_source_url,
        'metadata', jsonb_build_object(
          'transport','github_pr_bridge',
          'queue_id',new.editorial_metadata->>'github_queue_id'
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
    );
    return new;
  end if;

  insert into public.media_ingest_jobs(article_id,payload)
  values(new.id,v_payload)
  on conflict (article_id)
    where article_id is not null and status in ('pending','processing')
  do nothing;

  return new;
end;
$function$;
