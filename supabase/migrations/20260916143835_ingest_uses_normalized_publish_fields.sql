-- Route GitHub article ingest through normalize_github_publish_fields()
-- so aliases and cluster keys have one authoritative owner.

create or replace function public.ingest_github_publish_payload(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path to public
as $function$
declare
  q text;
  s text;
  h text;
  b text;
  c text;
  k public.article_kind;
  cid uuid;
  aid uuid;
  pa timestamptz;
  sm jsonb;
  em jsonb;
  sc uuid;
  tk text;
  sk text;
  v_payload_sha256 text;
  v_existing_payload_sha256 text;
  v_fields jsonb;
  v_deck text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload_must_be_object';
  end if;

  q := nullif(trim(p_payload->>'queue_id'),'');
  s := nullif(trim(p_payload->>'slug'),'');
  h := nullif(trim(p_payload->>'headline'),'');
  b := coalesce(p_payload->>'body_markdown','');
  c := nullif(lower(trim(p_payload->>'category_slug')),'');

  if q is null then raise exception 'queue_id_required'; end if;
  if s is null then raise exception 'slug_required'; end if;
  if h is null then raise exception 'headline_required'; end if;
  if c is null then raise exception 'category_slug_required'; end if;
  if char_length(s) > 180 then raise exception 'slug_too_long'; end if;
  if char_length(h) > 220 then raise exception 'headline_too_long'; end if;

  if coalesce(jsonb_typeof(p_payload->'source_metadata'),'array') <> 'array' then
    raise exception 'source_metadata_must_be_array';
  end if;
  if coalesce(jsonb_typeof(p_payload->'editorial_metadata'),'object') <> 'object' then
    raise exception 'editorial_metadata_must_be_object';
  end if;

  v_fields := public.normalize_github_publish_fields(p_payload);
  v_deck := nullif(v_fields->>'deck', '');
  if v_fields ? 'story_cluster_id' then
    sc := (v_fields->>'story_cluster_id')::uuid;
  end if;

  v_payload_sha256 := encode(extensions.digest(p_payload::text, 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended('github_queue_id:' || q, 0));

  select a.id, a.editorial_metadata->>'github_payload_sha256'
    into aid, v_existing_payload_sha256
  from public.articles a
  where a.github_queue_id = q
  order by a.created_at desc
  limit 1;

  if aid is not null then
    if v_existing_payload_sha256 is null then
      raise exception 'payload_fingerprint_missing:%', q;
    end if;
    if v_existing_payload_sha256 <> v_payload_sha256 then
      raise exception 'payload_mismatch:%', q;
    end if;

    perform public.publish_article_safely(aid);
    return aid;
  end if;

  perform public.upsert_editorial_source_registry(coalesce(p_payload->'source_registry_updates','[]'::jsonb));

  k := public.normalize_bridge_kind(p_payload->>'kind', c);
  select id into cid
  from public.categories
  where lower(slug) = c and active = true
  limit 1;
  if cid is null then raise exception 'unknown_category:%', c; end if;

  begin
    pa := coalesce(nullif(p_payload->>'publish_at','')::timestamptz, clock_timestamp());
  exception when others then
    raise exception 'invalid_publish_at';
  end;

  sm := coalesce(p_payload->'source_metadata','[]'::jsonb);
  perform public.upsert_editorial_source_registry_from_metadata(sm);

  em := coalesce(p_payload->'editorial_metadata','{}'::jsonb)
    || jsonb_build_object(
      'github_queue_id', q,
      'github_payload_sha256', v_payload_sha256,
      'publication_transport', 'github_pr_bridge',
      'publication_requested_at', clock_timestamp()
    );

  if v_fields ? 'sagen_kort' then
    em := jsonb_set(em, '{sagen_kort}', v_fields->'sagen_kort', true);
  end if;

  select id into aid from public.articles where slug = s limit 1;
  if aid is not null then raise exception 'slug_conflict:%', s; end if;

  tk := nullif(public.normalize_story_key(em->>'topic_key'),'');
  sk := coalesce(
    nullif(em->>'story_kind',''),
    case when k = 'magazine'::public.article_kind then 'evergreen_explainer' else 'news' end
  );

  if k = 'magazine'::public.article_kind then
    if tk is null then raise exception 'magazine_topic_key_required'; end if;
    if sk not in ('evergreen_explainer','followup','new_study','update') then
      raise exception 'magazine_story_kind_invalid';
    end if;
    em := jsonb_set(em,'{topic_key}',to_jsonb(tk),true);
    em := jsonb_set(em,'{story_kind}',to_jsonb(sk),true);
  end if;

  insert into public.articles(
    slug,kind,status,category_id,story_cluster_id,headline,frontpage_headline,
    headline_accent_text,deck,body_markdown,author_name,author_title,hero_url,
    hero_alt,hero_source_url,hero_candidate_url,hero_candidate_note,hero_credit,
    hero_license,hero_license_url,is_lead,lead_rank,is_breaking,breaking_until,
    publish_at,created_by,source_metadata,editorial_metadata,topic_key
  ) values (
    s,k,'scheduled'::public.article_status,cid,sc,h,
    nullif(p_payload->>'frontpage_headline',''),
    nullif(p_payload->>'headline_accent_text',''),
    v_deck,
    b,
    nullif(p_payload->>'author_name',''),
    nullif(p_payload->>'author_title',''),
    nullif(p_payload->>'hero_url',''),
    nullif(p_payload->>'hero_alt',''),
    nullif(p_payload->>'hero_source_url',''),
    nullif(p_payload->>'hero_candidate_url',''),
    nullif(p_payload->>'hero_candidate_note',''),
    nullif(p_payload->>'hero_credit',''),
    nullif(p_payload->>'hero_license',''),
    nullif(p_payload->>'hero_license_url',''),
    coalesce((p_payload->>'is_lead')::boolean,false),
    nullif(p_payload->>'lead_rank','')::integer,
    coalesce((p_payload->>'is_breaking')::boolean,false),
    nullif(p_payload->>'breaking_until','')::timestamptz,
    pa,
    'chatgpt_scheduled_github_bridge',
    sm,
    em,
    tk
  ) returning id into aid;

  perform public.publish_article_safely(aid);
  return aid;
end;
$function$;

revoke all on function public.ingest_github_publish_payload(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_github_publish_payload(jsonb) to service_role;
