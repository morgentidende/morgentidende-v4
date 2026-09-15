-- Refactor publication-time gating so direct publish and safe publish share
-- one canonical lock/check sequence. No business-rule changes.

create or replace function public.article_publication_transition_error_locked(
  p_article_id uuid,
  p_headline text,
  p_deck text,
  p_body_markdown text,
  p_hero_media_id uuid,
  p_hero_url text,
  p_source_metadata jsonb,
  p_editorial_metadata jsonb,
  p_kind public.article_kind,
  p_story_cluster_id uuid,
  p_topic_key text,
  p_check_duplicate boolean default true
)
returns text
language plpgsql
volatile
set search_path to 'public'
as $function$
declare
  v_error text;
begin
  v_error := public.article_publication_error_for_values(
    p_article_id,
    p_headline,
    p_deck,
    p_body_markdown,
    p_hero_media_id,
    p_hero_url,
    p_source_metadata,
    p_editorial_metadata
  );
  if v_error is not null then
    return v_error;
  end if;

  v_error := public.article_followup_validation_error(
    p_article_id,
    p_kind,
    p_story_cluster_id,
    p_topic_key,
    p_editorial_metadata
  );
  if v_error is not null then
    return v_error;
  end if;

  if not p_check_duplicate then
    return null;
  end if;

  perform public.lock_article_dedupe_keys(p_headline, p_kind, p_topic_key);

  return public.article_duplicate_publication_error(
    p_article_id,
    p_headline,
    p_kind,
    p_topic_key,
    p_story_cluster_id,
    p_editorial_metadata,
    false
  );
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
    v_error := public.article_publication_transition_error_locked(
      new.id,
      new.headline,
      new.deck,
      new.body_markdown,
      new.hero_media_id,
      new.hero_url,
      new.source_metadata,
      new.editorial_metadata,
      new.kind,
      new.story_cluster_id,
      new.topic_key,
      true
    );

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
  select * into article
  from public.articles
  where id = p_article_id
  for update;

  if not found then
    raise exception 'article not found: %', p_article_id;
  end if;

  if article.status = 'published'::public.article_status then
    return article.id;
  end if;

  begin
    v_requested_at := nullif(article.editorial_metadata->>'publication_requested_at','')::timestamptz;
  exception when others then
    v_requested_at := null;
  end;

  v_requested_at := coalesce(v_requested_at, v_now);
  v_release_at := public.article_qa_target_release_at(
    article.editorial_metadata,
    article.publish_at,
    v_requested_at
  );
  v_qa_state := public.article_current_qa_state(article.id);

  v_block_reason := public.article_publication_transition_error_locked(
    article.id,
    article.headline,
    article.deck,
    article.body_markdown,
    article.hero_media_id,
    article.hero_url,
    article.source_metadata,
    article.editorial_metadata,
    article.kind,
    article.story_cluster_id,
    article.topic_key,
    v_now >= v_release_at
  );

  if v_block_reason is not null then
    insert into public.publication_watchdog_events(article_id, issue_type, reason, details)
    values (
      article.id,
      'blocked',
      v_block_reason,
      jsonb_build_object(
        'source','publish_article_safely',
        'qa_state',v_qa_state,
        'publish_at',article.publish_at,
        'qa_release_at',v_release_at
      )
    )
    on conflict (article_id, issue_type)
      where resolved_at is null and issue_type in ('blocked','publish_failed')
    do update set reason = excluded.reason, details = excluded.details;
  end if;

  if v_block_reason is not null or v_now < v_release_at then
    update public.articles
    set status = 'scheduled'::public.article_status,
        publish_at = v_release_at,
        published_at = null,
        editorial_metadata = coalesce(editorial_metadata,'{}'::jsonb) || jsonb_build_object(
          'publication_requested_at',v_requested_at,
          'qa_release_at',v_release_at,
          'qa_mode','prepublication_45s',
          'qa_nonblocking',false,
          'qa_rule','current_version_qa_source_media_and_duplicate_gate_before_release',
          'publication_path','safe_publish'
        )
    where id = article.id;
    return article.id;
  end if;

  update public.articles
  set status = 'published'::public.article_status,
      publish_at = v_release_at,
      published_at = v_now,
      editorial_metadata = coalesce(editorial_metadata,'{}'::jsonb) || jsonb_build_object(
        'publication_requested_at',v_requested_at,
        'qa_release_at',v_release_at,
        'qa_mode','prepublication_45s',
        'qa_nonblocking',false,
        'qa_rule','current_version_qa_source_media_and_duplicate_gate_before_release',
        'publication_path','safe_publish',
        'qa_published_hash',v_qa_state->>'content_hash',
        'source_quality_at_publish',v_qa_state->'source_quality'
      )
  where id = article.id;

  update public.publication_watchdog_events
  set resolved_at = coalesce(resolved_at, v_now)
  where article_id = article.id
    and resolved_at is null
    and issue_type in ('blocked','publish_failed');

  return article.id;
end;
$function$;
