-- There is exactly one semantic dedupe: after Research and before Write.
-- The publication contract must not imply or expose a second duplicate gate.

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
  p_topic_key text
)
returns text
language plpgsql
set search_path to 'public'
as $function$
declare
  v_error text;
  v_sagen_kort jsonb := coalesce(p_editorial_metadata, '{}'::jsonb) -> 'sagen_kort';
begin
  if coalesce(jsonb_typeof(v_sagen_kort), 'null') <> 'array' then
    return 'sagen_kort_must_have_exactly_two_nonempty_points';
  end if;

  if jsonb_array_length(v_sagen_kort) <> 2 then
    return 'sagen_kort_must_have_exactly_two_nonempty_points';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_sagen_kort) as point(value)
    where jsonb_typeof(point.value) <> 'string'
       or btrim(point.value #>> '{}') = ''
  ) then
    return 'sagen_kort_must_have_exactly_two_nonempty_points';
  end if;

  if public.strip_structured_sections_from_markdown(coalesce(p_body_markdown, ''))
       is distinct from coalesce(p_body_markdown, '') then
    return 'structured_sections_must_not_appear_in_body_markdown';
  end if;

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

  return null;
end;
$function$;

create or replace function public.enforce_article_publication_contract()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_error text;
begin
  if tg_op = 'UPDATE'
     and new.status = 'scheduled'::public.article_status
     and old.hero_media_id is not null
     and new.hero_media_id is null then
    raise exception 'scheduled article hero cannot be detached; replace it with another archived media asset instead';
  end if;

  if new.status <> 'published'::public.article_status then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'publish_blocked: direct_published_insert_not_allowed';
  end if;

  if old.status is distinct from 'published'::public.article_status then
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
      new.topic_key
    );

    if v_error is not null then
      raise exception 'publish_blocked: %', v_error;
    end if;
  else
    if not (old.hero_media_id is null and new.hero_media_id is null) then
      v_error := public.article_media_publication_error(new.hero_media_id, new.hero_url);
      perform public.raise_article_media_publication_error(v_error);
    end if;
  end if;

  if new.story_cluster_id is not null
     and new.hero_media_id is not null
     and exists (
       select 1
       from public.articles other
       where other.id <> new.id
         and other.status = 'published'::public.article_status
         and other.story_cluster_id = new.story_cluster_id
         and other.hero_media_id = new.hero_media_id
     ) then
    raise exception 'published articles in the same story cluster must use distinct hero media';
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
  v_terminal_block boolean := false;
  v_metadata jsonb;
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
  v_release_at := public.article_qa_target_release_at(article.editorial_metadata, article.publish_at, v_requested_at);
  v_qa_state := public.article_current_qa_state(article.id);

  v_block_reason := public.article_publication_transition_error_locked(
    article.id, article.headline, article.deck, article.body_markdown,
    article.hero_media_id, article.hero_url, article.source_metadata,
    article.editorial_metadata, article.kind, article.story_cluster_id,
    article.topic_key
  );

  if v_block_reason is not null then
    v_terminal_block := public.article_publication_block_is_terminal(article.id, v_block_reason);
  end if;

  if v_block_reason is not null and v_terminal_block then
    v_metadata := coalesce(article.editorial_metadata,'{}'::jsonb)
      - 'publication_requested_at'
      - 'qa_release_at'
      - 'qa_scheduled_at'
      - 'qa_mode'
      - 'qa_stability';
    v_metadata := v_metadata || jsonb_build_object(
      'publication_attention', jsonb_build_object(
        'state','attention_required',
        'reason',v_block_reason,
        'checked_at',v_now,
        'qa_state',v_qa_state
      ),
      'publication_path','safe_publish'
    );

    update public.articles
    set status = 'draft'::public.article_status,
        publish_at = null,
        published_at = null,
        editorial_metadata = v_metadata
    where id = article.id;
    return article.id;
  end if;

  if v_block_reason is not null or v_now < v_release_at then
    v_metadata := coalesce(article.editorial_metadata,'{}'::jsonb) - 'publication_attention';
    v_metadata := v_metadata || jsonb_build_object(
      'publication_requested_at',v_requested_at,
      'qa_release_at',v_release_at,
      'qa_mode','current_version_prepublication',
      'qa_nonblocking',false,
      'qa_rule','current_version_qa_source_media_gate_before_release',
      'publication_path','safe_publish'
    );

    update public.articles
    set status = 'scheduled'::public.article_status,
        publish_at = v_release_at,
        published_at = null,
        editorial_metadata = v_metadata
    where id = article.id;
    return article.id;
  end if;

  update public.articles
  set status = 'published'::public.article_status,
      publish_at = v_release_at,
      published_at = v_now,
      editorial_metadata = (coalesce(editorial_metadata,'{}'::jsonb) - 'publication_attention') || jsonb_build_object(
        'publication_requested_at',v_requested_at,
        'qa_release_at',v_release_at,
        'qa_mode','current_version_prepublication',
        'qa_nonblocking',false,
        'qa_rule','current_version_qa_source_media_gate_before_release',
        'publication_path','safe_publish',
        'qa_published_hash',v_qa_state->>'content_hash',
        'source_quality_at_publish',v_qa_state->'source_quality'
      )
  where id = article.id;

  return article.id;
end;
$function$;

drop function if exists public.article_publication_transition_error_locked(
  uuid,text,text,text,uuid,text,jsonb,jsonb,public.article_kind,uuid,text,boolean
);
