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
  v_block_reason := public.article_publication_error_for_values(
    article.id,article.headline,article.deck,article.body_markdown,
    article.hero_media_id,article.hero_url,article.source_metadata,article.editorial_metadata
  );

  if v_block_reason is null then
    v_block_reason := public.article_followup_validation_error(
      article.id,article.kind,article.story_cluster_id,article.topic_key,article.editorial_metadata
    );
  end if;

  if v_block_reason is not null then
    insert into public.publication_watchdog_events(article_id,issue_type,reason,details)
    values(article.id,'blocked',v_block_reason,jsonb_build_object(
      'source','publish_article_safely','qa_state',v_qa_state,
      'publish_at',article.publish_at,'qa_release_at',v_release_at
    ))
    on conflict (article_id,issue_type) where resolved_at is null and issue_type in ('blocked','publish_failed')
    do update set reason=excluded.reason,details=excluded.details;
  end if;

  if v_block_reason is not null or v_now < v_release_at then
    update public.articles
    set status='scheduled'::public.article_status,
        publish_at=v_release_at,
        published_at=null,
        editorial_metadata=coalesce(editorial_metadata,'{}'::jsonb)||jsonb_build_object(
          'publication_requested_at',v_requested_at,'qa_release_at',v_release_at,
          'qa_mode','prepublication_45s','qa_nonblocking',false,
          'qa_rule','current_version_qa_source_media_before_release',
          'publication_path','safe_publish'
        )
    where id=article.id;
    return article.id;
  end if;

  update public.articles
  set status='published'::public.article_status,
      publish_at=v_release_at,
      published_at=v_now,
      editorial_metadata=coalesce(editorial_metadata,'{}'::jsonb)||jsonb_build_object(
        'publication_requested_at',v_requested_at,'qa_release_at',v_release_at,
        'qa_mode','prepublication_45s','qa_nonblocking',false,
        'qa_rule','current_version_qa_source_media_before_release',
        'publication_path','safe_publish','qa_published_hash',v_qa_state->>'content_hash',
        'source_quality_at_publish',v_qa_state->'source_quality'
      )
  where id=article.id;

  update public.publication_watchdog_events
  set resolved_at=coalesce(resolved_at,v_now)
  where article_id=article.id and resolved_at is null and issue_type in ('blocked','publish_failed');

  return article.id;
end;
$function$;
