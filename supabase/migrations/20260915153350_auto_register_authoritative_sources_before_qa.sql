create or replace function public.upsert_editorial_source_registry_from_metadata(p_source_metadata jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  item jsonb;
  updates jsonb := '[]'::jsonb;
  v_type text;
  v_url text;
  v_publisher text;
begin
  if p_source_metadata is null then return 0; end if;
  if jsonb_typeof(p_source_metadata) <> 'array' then raise exception 'source_metadata_must_be_array'; end if;

  for item in select value from jsonb_array_elements(p_source_metadata)
  loop
    if jsonb_typeof(item) <> 'object' then continue; end if;
    v_type := lower(coalesce(item->>'source_type',''));
    if v_type not in ('authoritative','primary_official') then continue; end if;
    v_url := nullif(btrim(item->>'url'),'');
    if v_url is null then continue; end if;
    v_publisher := coalesce(nullif(btrim(item->>'publisher'),''), public.normalize_editorial_source_domain(v_url));
    updates := updates || jsonb_build_array(jsonb_build_object(
      'url', v_url,
      'source_name', v_publisher,
      'classification', 'authoritative',
      'rationale', case when v_type = 'primary_official' then 'Primary official source classified by publishing automation' else 'Authoritative source classified by publishing automation' end
    ));
  end loop;

  if jsonb_array_length(updates) = 0 then return 0; end if;
  return public.upsert_editorial_source_registry(updates);
end;
$function$;

create or replace function public.ingest_github_publish_payload(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare v_queue_id text; v_slug text; v_headline text; v_body text; v_category_slug text; v_kind public.article_kind; v_category_id uuid; v_article_id uuid; v_publish_at timestamptz; v_source_metadata jsonb; v_editorial_metadata jsonb; v_story_cluster_id uuid; v_topic_key text; v_story_kind text; v_duplicate_error text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'payload_must_be_object'; end if;
  perform public.upsert_editorial_source_registry(coalesce(p_payload->'source_registry_updates','[]'::jsonb));
  v_queue_id := nullif(trim(p_payload->>'queue_id'), ''); v_slug := nullif(trim(p_payload->>'slug'), ''); v_headline := nullif(trim(p_payload->>'headline'), ''); v_body := coalesce(p_payload->>'body_markdown', ''); v_category_slug := nullif(lower(trim(p_payload->>'category_slug')), '');
  if v_queue_id is null then raise exception 'queue_id_required'; end if; if v_slug is null then raise exception 'slug_required'; end if; if v_headline is null then raise exception 'headline_required'; end if; if v_category_slug is null then raise exception 'category_slug_required'; end if;
  if char_length(v_slug) > 180 then raise exception 'slug_too_long'; end if; if char_length(v_headline) > 220 then raise exception 'headline_too_long'; end if;
  if coalesce(jsonb_typeof(p_payload->'source_metadata'), 'array') <> 'array' then raise exception 'source_metadata_must_be_array'; end if; if coalesce(jsonb_typeof(p_payload->'editorial_metadata'), 'object') <> 'object' then raise exception 'editorial_metadata_must_be_object'; end if;
  v_kind := public.normalize_bridge_kind(p_payload->>'kind', v_category_slug); select id into v_category_id from public.categories where lower(slug)=v_category_slug and active=true limit 1; if v_category_id is null then raise exception 'unknown_category:%', v_category_slug; end if;
  if nullif(p_payload->>'story_cluster_id','') is not null then begin v_story_cluster_id := (p_payload->>'story_cluster_id')::uuid; exception when others then raise exception 'invalid_story_cluster_id'; end; end if;
  begin v_publish_at := coalesce(nullif(p_payload->>'publish_at','')::timestamptz, clock_timestamp()); exception when others then raise exception 'invalid_publish_at'; end;
  v_source_metadata := coalesce(p_payload->'source_metadata','[]'::jsonb);
  perform public.upsert_editorial_source_registry_from_metadata(v_source_metadata);
  v_editorial_metadata := coalesce(p_payload->'editorial_metadata','{}'::jsonb) || jsonb_build_object('github_queue_id',v_queue_id,'publication_transport','github_pr_bridge','publication_requested_at',clock_timestamp());
  perform pg_advisory_xact_lock(hashtextextended('github_queue_id:' || v_queue_id, 0)); select id into v_article_id from public.articles where github_queue_id=v_queue_id order by created_at desc limit 1; if v_article_id is not null then perform public.publish_article_safely(v_article_id); return v_article_id; end if;
  select id into v_article_id from public.articles where slug=v_slug limit 1; if v_article_id is not null then raise exception 'slug_conflict:%',v_slug; end if;
  v_topic_key := nullif(public.normalize_story_key(v_editorial_metadata->>'topic_key'),''); v_story_kind := coalesce(nullif(v_editorial_metadata->>'story_kind',''),case when v_kind='magazine'::public.article_kind then 'evergreen_explainer' else 'news' end);
  if v_kind='magazine'::public.article_kind then if v_topic_key is null then raise exception 'magazine_topic_key_required'; end if; if v_story_kind not in ('evergreen_explainer','followup','new_study','update') then raise exception 'magazine_story_kind_invalid'; end if; v_editorial_metadata := jsonb_set(v_editorial_metadata,'{topic_key}',to_jsonb(v_topic_key),true); v_editorial_metadata := jsonb_set(v_editorial_metadata,'{story_kind}',to_jsonb(v_story_kind),true); end if;
  perform public.lock_article_dedupe_keys(v_headline,v_kind,v_topic_key); v_duplicate_error := public.article_duplicate_publication_error(null,v_headline,v_kind,v_topic_key,v_story_cluster_id,v_editorial_metadata,true); if v_duplicate_error is not null then raise exception '%',v_duplicate_error; end if;
  insert into public.articles (slug,kind,status,category_id,story_cluster_id,headline,frontpage_headline,headline_accent_text,deck,body_markdown,author_name,author_title,hero_url,hero_alt,hero_source_url,hero_candidate_url,hero_candidate_note,hero_credit,hero_license,hero_license_url,is_lead,lead_rank,is_breaking,breaking_until,publish_at,created_by,source_metadata,editorial_metadata,topic_key)
  values (v_slug,v_kind,'scheduled'::public.article_status,v_category_id,v_story_cluster_id,v_headline,nullif(p_payload->>'frontpage_headline',''),nullif(p_payload->>'headline_accent_text',''),nullif(p_payload->>'deck',''),v_body,nullif(p_payload->>'author_name',''),nullif(p_payload->>'author_title',''),nullif(p_payload->>'hero_url',''),nullif(p_payload->>'hero_alt',''),nullif(p_payload->>'hero_source_url',''),nullif(p_payload->>'hero_candidate_url',''),nullif(p_payload->>'hero_candidate_note',''),nullif(p_payload->>'hero_credit',''),nullif(p_payload->>'hero_license',''),nullif(p_payload->>'hero_license_url',''),coalesce((p_payload->>'is_lead')::boolean,false),nullif(p_payload->>'lead_rank','')::integer,coalesce((p_payload->>'is_breaking')::boolean,false),nullif(p_payload->>'breaking_until','')::timestamptz,v_publish_at,'chatgpt_scheduled_github_bridge',v_source_metadata,v_editorial_metadata,v_topic_key) returning id into v_article_id;
  perform public.publish_article_safely(v_article_id); return v_article_id;
end;
$function$;
