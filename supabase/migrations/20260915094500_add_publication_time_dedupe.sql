-- Make 7-day duplicate protection a publication-time invariant as well as
-- an ingest-time gate. Keep duplicate checks pure/read-only and take
-- advisory transaction locks only in mutation paths.

create or replace function public.article_followup_validation_error(
  p_article_id uuid,
  p_kind public.article_kind,
  p_story_cluster_id uuid,
  p_topic_key text,
  p_editorial_metadata jsonb
)
returns text
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_story_kind text;
  v_parent_id uuid;
  v_reason text;
  v_parent public.articles%rowtype;
  v_topic_key text;
  v_parent_topic_key text;
begin
  v_story_kind := coalesce(
    nullif(coalesce(p_editorial_metadata, '{}'::jsonb)->>'story_kind',''),
    case when p_kind = 'magazine'::public.article_kind then 'evergreen_explainer' else 'news' end
  );

  if v_story_kind <> 'followup' then
    return null;
  end if;

  if p_story_cluster_id is null then
    return 'followup_requires_cluster';
  end if;

  begin
    v_parent_id := nullif(coalesce(p_editorial_metadata, '{}'::jsonb)->>'followup_parent_article_id','')::uuid;
  exception when others then
    return 'followup_parent_invalid';
  end;

  if v_parent_id is null then
    return 'followup_requires_parent';
  end if;

  if p_article_id is not null and v_parent_id = p_article_id then
    return 'followup_parent_self_reference';
  end if;

  v_reason := nullif(coalesce(p_editorial_metadata, '{}'::jsonb)->>'followup_reason','');
  if v_reason is null or v_reason not in (
    'new_fact','official_response','arrest','new_data','court_decision','material_update'
  ) then
    return 'followup_requires_reason';
  end if;

  select * into v_parent
  from public.articles
  where id = v_parent_id;

  if not found then return 'followup_parent_not_found'; end if;

  if v_parent.status not in ('published'::public.article_status, 'unpublished'::public.article_status)
     or coalesce(v_parent.first_published_at, v_parent.published_at) is null then
    return 'followup_parent_never_published';
  end if;

  if v_parent.story_cluster_id is distinct from p_story_cluster_id then
    return 'followup_parent_cluster_mismatch';
  end if;

  if p_kind = 'magazine'::public.article_kind then
    v_topic_key := nullif(public.normalize_story_key(p_topic_key), '');
    v_parent_topic_key := nullif(public.normalize_story_key(v_parent.topic_key), '');
    if v_topic_key is not null
       and v_parent_topic_key is not null
       and v_topic_key is distinct from v_parent_topic_key then
      return 'followup_topic_mismatch';
    end if;
  end if;

  return null;
end;
$function$;

create or replace function public.validate_article_followup_metadata()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_error text;
begin
  v_error := public.article_followup_validation_error(
    new.id,
    new.kind,
    new.story_cluster_id,
    new.topic_key,
    new.editorial_metadata
  );

  if v_error is not null then
    raise exception '%', v_error;
  end if;

  return new;
end;
$function$;

create or replace function public.lock_article_dedupe_keys(
  p_headline text,
  p_kind public.article_kind,
  p_topic_key text
)
returns void
language plpgsql
volatile
set search_path to 'public'
as $function$
declare
  v_headline_key text;
  v_topic_key text;
begin
  v_headline_key := public.normalize_story_key(p_headline);
  v_topic_key := nullif(public.normalize_story_key(p_topic_key), '');

  if nullif(v_headline_key, '') is not null then
    perform pg_advisory_xact_lock(hashtextextended('headline:' || v_headline_key, 0));
  end if;

  if p_kind = 'magazine'::public.article_kind and v_topic_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('topic:' || v_topic_key, 0));
  end if;
end;
$function$;

create or replace function public.article_duplicate_publication_error(
  p_article_id uuid,
  p_headline text,
  p_kind public.article_kind,
  p_topic_key text,
  p_story_cluster_id uuid,
  p_editorial_metadata jsonb,
  p_include_scheduled boolean default false
)
returns text
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_headline_key text;
  v_topic_key text;
  v_story_kind text;
  v_followup_error text;
  v_valid_followup boolean := false;
  v_duplicate_id uuid;
begin
  v_headline_key := public.normalize_story_key(p_headline);
  v_topic_key := nullif(public.normalize_story_key(p_topic_key), '');
  v_story_kind := coalesce(
    nullif(coalesce(p_editorial_metadata, '{}'::jsonb)->>'story_kind',''),
    case when p_kind = 'magazine'::public.article_kind then 'evergreen_explainer' else 'news' end
  );

  if v_story_kind = 'followup' then
    v_followup_error := public.article_followup_validation_error(
      p_article_id,
      p_kind,
      p_story_cluster_id,
      v_topic_key,
      p_editorial_metadata
    );
    v_valid_followup := v_followup_error is null;
  end if;

  select a.id into v_duplicate_id
  from public.articles a
  where a.id is distinct from p_article_id
    and (
      (
        p_include_scheduled
        and a.status in ('published'::public.article_status, 'scheduled'::public.article_status)
        and coalesce(a.published_at, a.publish_at, a.created_at) >= clock_timestamp() - interval '7 days'
      )
      or
      (
        not p_include_scheduled
        and a.status = 'published'::public.article_status
        and a.published_at >= clock_timestamp() - interval '7 days'
      )
    )
    and public.normalize_story_key(a.headline) = v_headline_key
  order by coalesce(a.published_at, a.publish_at, a.created_at) desc
  limit 1;

  if v_duplicate_id is not null then
    return 'duplicate_7d_exact:' || v_duplicate_id::text;
  end if;

  if p_kind = 'magazine'::public.article_kind
     and v_topic_key is not null
     and not v_valid_followup then
    select a.id into v_duplicate_id
    from public.articles a
    where a.id is distinct from p_article_id
      and (
        (
          p_include_scheduled
          and a.status in ('published'::public.article_status, 'scheduled'::public.article_status)
          and coalesce(a.published_at, a.publish_at, a.created_at) >= clock_timestamp() - interval '7 days'
        )
        or
        (
          not p_include_scheduled
          and a.status = 'published'::public.article_status
          and a.published_at >= clock_timestamp() - interval '7 days'
        )
      )
      and a.topic_key = v_topic_key
    order by coalesce(a.published_at, a.publish_at, a.created_at) desc
    limit 1;

    if v_duplicate_id is not null then
      return 'duplicate_7d_topic:' || v_duplicate_id::text;
    end if;
  end if;

  return null;
end;
$function$;

create or replace function public.enforce_publish_qa_invariants()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_error text;
begin
  if tg_op = 'INSERT' and new.status = 'published'::public.article_status then
    raise exception 'publish_blocked: direct_published_insert_not_allowed';
  end if;

  if tg_op = 'UPDATE'
     and new.status = 'published'::public.article_status
     and old.status is distinct from 'published'::public.article_status then
    v_error := public.article_publication_error_for_values(
      new.id,
      new.headline,
      new.deck,
      new.body_markdown,
      new.hero_media_id,
      new.hero_url,
      new.source_metadata,
      new.editorial_metadata
    );

    if v_error is null then
      v_error := public.article_followup_validation_error(
        new.id,
        new.kind,
        new.story_cluster_id,
        new.topic_key,
        new.editorial_metadata
      );
    end if;

    if v_error is null then
      perform public.lock_article_dedupe_keys(new.headline, new.kind, new.topic_key);
      v_error := public.article_duplicate_publication_error(
        new.id,
        new.headline,
        new.kind,
        new.topic_key,
        new.story_cluster_id,
        new.editorial_metadata,
        false
      );
    end if;

    if v_error is not null then
      raise exception 'publish_blocked: %', v_error;
    end if;
  end if;

  return new;
end;
$function$;

create or replace function public.publish_article_safely(p_article_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  article public.articles%rowtype;
  v_now timestamptz := clock_timestamp();
  v_requested_at timestamptz;
  v_release_at timestamptz;
  v_qa_state jsonb;
  v_block_reason text;
begin
  select * into article from public.articles where id=p_article_id for update;
  if not found then raise exception 'article not found: %',p_article_id; end if;
  if article.status='published'::public.article_status then return article.id; end if;

  begin v_requested_at := nullif(article.editorial_metadata->>'publication_requested_at','')::timestamptz;
  exception when others then v_requested_at := null; end;
  v_requested_at := coalesce(v_requested_at,v_now);
  v_release_at := public.article_qa_target_release_at(article.editorial_metadata,article.publish_at,v_requested_at);
  v_qa_state := public.article_current_qa_state(article.id);
  v_block_reason := public.article_publication_error_for_values(article.id,article.headline,article.deck,article.body_markdown,article.hero_media_id,article.hero_url,article.source_metadata,article.editorial_metadata);

  if v_block_reason is null then
    v_block_reason := public.article_followup_validation_error(
      article.id,
      article.kind,
      article.story_cluster_id,
      article.topic_key,
      article.editorial_metadata
    );
  end if;

  -- Dedupe is a publication-time invariant. Only take advisory locks once
  -- this article is otherwise ready for release; diagnostic helpers stay
  -- read-only and lock-free.
  if v_block_reason is null and v_now >= v_release_at then
    perform public.lock_article_dedupe_keys(article.headline, article.kind, article.topic_key);
    v_block_reason := public.article_duplicate_publication_error(
      article.id,
      article.headline,
      article.kind,
      article.topic_key,
      article.story_cluster_id,
      article.editorial_metadata,
      false
    );
  end if;

  if v_block_reason is not null then
    insert into public.publication_watchdog_events(article_id,issue_type,reason,details)
    values(article.id,'blocked',v_block_reason,jsonb_build_object('source','publish_article_safely','qa_state',v_qa_state,'publish_at',article.publish_at,'qa_release_at',v_release_at))
    on conflict (article_id,issue_type) where resolved_at is null and issue_type in ('blocked','publish_failed')
    do update set reason=excluded.reason,details=excluded.details;
  end if;

  if v_block_reason is not null or v_now < v_release_at then
    update public.articles set status='scheduled'::public.article_status,publish_at=v_release_at,published_at=null,
      editorial_metadata=coalesce(editorial_metadata,'{}'::jsonb)||jsonb_build_object('publication_requested_at',v_requested_at,'qa_release_at',v_release_at,'qa_mode','prepublication_45s','qa_nonblocking',false,'qa_rule','current_version_qa_source_media_and_duplicate_gate_before_release','publication_path','safe_publish')
    where id=article.id;
    return article.id;
  end if;

  update public.articles set status='published'::public.article_status,publish_at=v_release_at,published_at=v_now,
    editorial_metadata=coalesce(editorial_metadata,'{}'::jsonb)||jsonb_build_object('publication_requested_at',v_requested_at,'qa_release_at',v_release_at,'qa_mode','prepublication_45s','qa_nonblocking',false,'qa_rule','current_version_qa_source_media_and_duplicate_gate_before_release','publication_path','safe_publish','qa_published_hash',v_qa_state->>'content_hash','source_quality_at_publish',v_qa_state->'source_quality')
  where id=article.id;

  update public.publication_watchdog_events set resolved_at=coalesce(resolved_at,v_now)
  where article_id=article.id and resolved_at is null and issue_type in ('blocked','publish_failed');
  return article.id;
end;
$function$;

create or replace function public.ingest_github_publish_payload(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_queue_id text;
  v_slug text;
  v_headline text;
  v_body text;
  v_category_slug text;
  v_kind public.article_kind;
  v_category_id uuid;
  v_article_id uuid;
  v_existing_queue text;
  v_publish_at timestamptz;
  v_source_metadata jsonb;
  v_editorial_metadata jsonb;
  v_story_cluster_id uuid;
  v_topic_key text;
  v_story_kind text;
  v_duplicate_error text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload_must_be_object';
  end if;

  v_queue_id := nullif(trim(p_payload->>'queue_id'), '');
  v_slug := nullif(trim(p_payload->>'slug'), '');
  v_headline := nullif(trim(p_payload->>'headline'), '');
  v_body := coalesce(p_payload->>'body_markdown', '');
  v_category_slug := nullif(lower(trim(p_payload->>'category_slug')), '');

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

  v_kind := public.normalize_bridge_kind(p_payload->>'kind', v_category_slug);

  select id into v_category_id
  from public.categories
  where lower(slug) = v_category_slug and active = true
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

  v_topic_key := nullif(public.normalize_story_key(v_editorial_metadata->>'topic_key'), '');
  v_story_kind := coalesce(
    nullif(v_editorial_metadata->>'story_kind',''),
    case when v_kind = 'magazine'::public.article_kind then 'evergreen_explainer' else 'news' end
  );

  if v_kind = 'magazine'::public.article_kind then
    if v_topic_key is null then
      raise exception 'magazine_topic_key_required';
    end if;
    if v_story_kind not in ('evergreen_explainer', 'followup', 'new_study', 'update') then
      raise exception 'magazine_story_kind_invalid';
    end if;
    v_editorial_metadata := jsonb_set(v_editorial_metadata, '{topic_key}', to_jsonb(v_topic_key), true);
    v_editorial_metadata := jsonb_set(v_editorial_metadata, '{story_kind}', to_jsonb(v_story_kind), true);
  end if;

  perform public.lock_article_dedupe_keys(v_headline, v_kind, v_topic_key);
  v_duplicate_error := public.article_duplicate_publication_error(
    null,
    v_headline,
    v_kind,
    v_topic_key,
    v_story_cluster_id,
    v_editorial_metadata,
    true
  );
  if v_duplicate_error is not null then
    raise exception '%', v_duplicate_error;
  end if;

  insert into public.articles (
    slug, kind, status, category_id, story_cluster_id,
    headline, frontpage_headline, headline_accent_text, deck, body_markdown,
    author_name, author_title,
    hero_url, hero_alt, hero_source_url, hero_candidate_url, hero_candidate_note,
    hero_credit, hero_license, hero_license_url,
    is_lead, lead_rank, is_breaking, breaking_until,
    publish_at, created_by, source_metadata, editorial_metadata, topic_key
  ) values (
    v_slug, v_kind, 'scheduled'::public.article_status, v_category_id, v_story_cluster_id,
    v_headline, nullif(p_payload->>'frontpage_headline',''), nullif(p_payload->>'headline_accent_text',''),
    nullif(p_payload->>'deck',''), v_body,
    nullif(p_payload->>'author_name',''), nullif(p_payload->>'author_title',''),
    nullif(p_payload->>'hero_url',''), nullif(p_payload->>'hero_alt',''), nullif(p_payload->>'hero_source_url',''),
    nullif(p_payload->>'hero_candidate_url',''), nullif(p_payload->>'hero_candidate_note',''),
    nullif(p_payload->>'hero_credit',''), nullif(p_payload->>'hero_license',''), nullif(p_payload->>'hero_license_url',''),
    coalesce((p_payload->>'is_lead')::boolean, false), nullif(p_payload->>'lead_rank','')::integer,
    coalesce((p_payload->>'is_breaking')::boolean, false), nullif(p_payload->>'breaking_until','')::timestamptz,
    v_publish_at, 'chatgpt_scheduled_github_bridge', v_source_metadata, v_editorial_metadata, v_topic_key
  )
  returning id into v_article_id;

  perform public.publish_article_safely(v_article_id);
  return v_article_id;
end;
$function$;
