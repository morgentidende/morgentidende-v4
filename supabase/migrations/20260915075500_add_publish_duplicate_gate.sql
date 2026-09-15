-- Minimal seven-day duplicate gate for GitHub publish bridge.
-- Exact normalized headlines are blocked for all article kinds. Magazine
-- evergreen payloads can also supply a stable editorial_metadata.topic_key.
-- Advisory transaction locks make same-story races deterministic.

create or replace function public.normalize_story_key(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(
    regexp_replace(
      regexp_replace(lower(coalesce(p_text, '')), '[[:punct:]]+', ' ', 'g'),
      '\s+', ' ', 'g'
    )
  );
$$;

create or replace function public.ingest_github_publish_payload(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue_id text;
  v_slug text;
  v_headline text;
  v_headline_key text;
  v_body text;
  v_category_slug text;
  v_kind public.article_kind;
  v_category_id uuid;
  v_article_id uuid;
  v_duplicate_id uuid;
  v_existing_queue text;
  v_publish_at timestamptz;
  v_source_metadata jsonb;
  v_editorial_metadata jsonb;
  v_story_cluster_id uuid;
  v_topic_key text;
  v_story_kind text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload_must_be_object';
  end if;

  v_queue_id := nullif(trim(p_payload->>'queue_id'), '');
  v_slug := nullif(trim(p_payload->>'slug'), '');
  v_headline := nullif(trim(p_payload->>'headline'), '');
  v_body := coalesce(p_payload->>'body_markdown', '');
  v_category_slug := nullif(trim(p_payload->>'category_slug'), '');

  if v_queue_id is null then raise exception 'queue_id_required'; end if;
  if v_slug is null then raise exception 'slug_required'; end if;
  if v_headline is null then raise exception 'headline_required'; end if;
  if v_category_slug is null then raise exception 'category_slug_required'; end if;
  if char_length(v_slug) > 180 then raise exception 'slug_too_long'; end if;
  if char_length(v_headline) > 220 then raise exception 'headline_too_long'; end if;

  if coalesce(jsonb_typeof(p_payload->'source_metadata'), 'array') <> 'array' then
    raise exception 'source_metadata_must_be_array';
  end if;
  if coalesce(jsonb_typeof(p_payload->'editorial_metadata'), 'object') <> 'object' then
    raise exception 'editorial_metadata_must_be_object';
  end if;

  begin
    v_kind := coalesce(nullif(p_payload->>'kind',''), 'news')::public.article_kind;
  exception when others then
    raise exception 'invalid_article_kind';
  end;

  select id into v_category_id
  from public.categories
  where slug = v_category_slug and active = true
  limit 1;
  if v_category_id is null then raise exception 'unknown_category:%', v_category_slug; end if;

  if nullif(p_payload->>'story_cluster_id','') is not null then
    begin
      v_story_cluster_id := (p_payload->>'story_cluster_id')::uuid;
    exception when others then
      raise exception 'invalid_story_cluster_id';
    end;
  end if;

  begin
    v_publish_at := coalesce(nullif(p_payload->>'publish_at','')::timestamptz, clock_timestamp());
  exception when others then
    raise exception 'invalid_publish_at';
  end;

  v_source_metadata := coalesce(p_payload->'source_metadata', '[]'::jsonb);
  v_editorial_metadata := coalesce(p_payload->'editorial_metadata', '{}'::jsonb)
    || jsonb_build_object(
      'github_queue_id', v_queue_id,
      'publication_transport', 'github_pr_bridge',
      'publication_requested_at', clock_timestamp()
    );

  -- Preserve current bridge idempotency before duplicate evaluation.
  select id, editorial_metadata->>'github_queue_id'
    into v_article_id, v_existing_queue
  from public.articles
  where slug = v_slug
  limit 1;

  if v_article_id is not null then
    if v_existing_queue = v_queue_id then
      perform public.publish_article_safely(v_article_id);
      return v_article_id;
    end if;
    raise exception 'slug_conflict:%', v_slug;
  end if;

  select id into v_article_id
  from public.articles
  where editorial_metadata->>'github_queue_id' = v_queue_id
  order by created_at desc
  limit 1;

  if v_article_id is not null then
    perform public.publish_article_safely(v_article_id);
    return v_article_id;
  end if;

  v_headline_key := public.normalize_story_key(v_headline);
  v_topic_key := nullif(public.normalize_story_key(v_editorial_metadata->>'topic_key'), '');
  v_story_kind := coalesce(nullif(v_editorial_metadata->>'story_kind',''),
                           case when v_kind = 'magazine'::public.article_kind then 'evergreen_explainer' else 'news' end);

  -- Serialize identical story candidates so two simultaneous bridge calls cannot
  -- both pass the read-before-insert check.
  perform pg_advisory_xact_lock(hashtextextended('headline:' || v_headline_key, 0));
  if v_topic_key is not null and v_story_kind <> 'followup' then
    perform pg_advisory_xact_lock(hashtextextended('topic:' || v_topic_key, 0));
  end if;

  select a.id into v_duplicate_id
  from public.articles a
  where a.status in ('published'::public.article_status, 'scheduled'::public.article_status)
    and coalesce(a.published_at, a.publish_at, a.created_at) >= clock_timestamp() - interval '7 days'
    and public.normalize_story_key(a.headline) = v_headline_key
  order by coalesce(a.published_at, a.publish_at, a.created_at) desc
  limit 1;

  if v_duplicate_id is not null then
    raise exception 'duplicate_7d_exact:%', v_duplicate_id;
  end if;

  if v_kind = 'magazine'::public.article_kind
     and v_topic_key is not null
     and v_story_kind <> 'followup' then
    select a.id into v_duplicate_id
    from public.articles a
    where a.status in ('published'::public.article_status, 'scheduled'::public.article_status)
      and coalesce(a.published_at, a.publish_at, a.created_at) >= clock_timestamp() - interval '7 days'
      and public.normalize_story_key(a.editorial_metadata->>'topic_key') = v_topic_key
    order by coalesce(a.published_at, a.publish_at, a.created_at) desc
    limit 1;

    if v_duplicate_id is not null then
      raise exception 'duplicate_7d_topic:%', v_duplicate_id;
    end if;
  end if;

  insert into public.articles (
    slug, kind, status, category_id, story_cluster_id,
    headline, frontpage_headline, headline_accent_text, deck, body_markdown,
    author_name, author_title,
    hero_url, hero_alt, hero_source_url, hero_candidate_url, hero_candidate_note,
    hero_credit, hero_license, hero_license_url,
    is_lead, lead_rank, is_breaking, breaking_until,
    publish_at, created_by, source_metadata, editorial_metadata
  ) values (
    v_slug,
    v_kind,
    'scheduled'::public.article_status,
    v_category_id,
    v_story_cluster_id,
    v_headline,
    nullif(p_payload->>'frontpage_headline',''),
    nullif(p_payload->>'headline_accent_text',''),
    nullif(p_payload->>'deck',''),
    v_body,
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
    coalesce((p_payload->>'is_lead')::boolean, false),
    nullif(p_payload->>'lead_rank','')::integer,
    coalesce((p_payload->>'is_breaking')::boolean, false),
    nullif(p_payload->>'breaking_until','')::timestamptz,
    v_publish_at,
    'chatgpt_scheduled_github_bridge',
    v_source_metadata,
    v_editorial_metadata
  )
  returning id into v_article_id;

  perform public.publish_article_safely(v_article_id);
  return v_article_id;
end;
$$;
