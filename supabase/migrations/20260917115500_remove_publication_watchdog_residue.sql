-- Publication is now a direct state machine. Preserve historical watchdog data,
-- but stop writing new publication watchdog events and remove stale 45s labels.

create or replace function public.publish_article_safely(p_article_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
    article.topic_key, v_now >= v_release_at
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
$$;

-- A failed current-version QA run is already terminal under
-- article_publication_block_is_terminal. Route it through the same state
-- transition so it does not remain scheduled indefinitely.
create or replace function public.finish_article_qa_run(
  p_job_id uuid,
  p_claim_token uuid,
  p_expected_hash text,
  p_status text,
  p_duration_ms integer default null,
  p_warnings jsonb default null,
  p_fixes_applied jsonb default null,
  p_engine text default 'deterministic-v2'
)
returns public.article_qa_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.article_qa_runs%rowtype;
  a public.articles%rowtype;
  v_live_hash text;
begin
  if p_status not in ('passed', 'warnings', 'failed', 'superseded') then
    raise exception 'invalid_qa_finish_status';
  end if;

  select * into j
  from public.article_qa_runs
  where id = p_job_id
  for update;

  if not found
     or j.status <> 'running'
     or j.claim_token is distinct from p_claim_token
     or j.content_hash is distinct from p_expected_hash then
    return null;
  end if;

  if p_status in ('passed', 'warnings') then
    select * into a
    from public.articles
    where id = j.article_id
    for update;

    if not found then
      p_status := 'failed';
      p_warnings := coalesce(p_warnings, '[]'::jsonb) || jsonb_build_array('article_not_found');
    else
      v_live_hash := public.article_qa_content_hash(
        a.headline,
        a.deck,
        a.body_markdown,
        a.hero_media_id,
        a.hero_url,
        a.source_metadata
      );

      if v_live_hash is distinct from p_expected_hash then
        p_status := 'superseded';
        p_warnings := coalesce(p_warnings, '[]'::jsonb)
          || jsonb_build_array('superseded_live_hash_changed_before_finish');
      end if;
    end if;
  end if;

  update public.article_qa_runs
     set status = p_status,
         finished_at = clock_timestamp(),
         duration_ms = coalesce(p_duration_ms, duration_ms),
         warnings = coalesce(p_warnings, warnings, '[]'::jsonb),
         fixes_applied = coalesce(p_fixes_applied, fixes_applied, '[]'::jsonb),
         engine = coalesce(p_engine, engine, 'deterministic-v2'),
         updated_at = clock_timestamp()
   where id = p_job_id
     and status = 'running'
     and claim_token = p_claim_token
     and content_hash is not distinct from p_expected_hash
  returning * into j;

  if j.id is not null and j.status in ('passed','warnings','failed') then
    begin
      perform public.publish_article_safely(j.article_id);
    exception when others then
      null;
    end;
  end if;

  return j;
end;
$$;
