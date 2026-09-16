create or replace function public.publish_article_safely(p_article_id uuid)
returns uuid
language plpgsql
security definer
set search_path = 'public'
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
    v_terminal_block := public.article_publication_block_is_terminal(article.id, v_block_reason);

    insert into public.publication_watchdog_events(article_id, issue_type, reason, details)
    values (
      article.id,
      'blocked',
      v_block_reason,
      jsonb_build_object(
        'source','publish_article_safely',
        'qa_state',v_qa_state,
        'publish_at',article.publish_at,
        'qa_release_at',v_release_at,
        'terminal',v_terminal_block
      )
    )
    on conflict (article_id, issue_type)
      where resolved_at is null and issue_type in ('blocked','publish_failed')
    do update set reason = excluded.reason, details = excluded.details;
  end if;

  if v_block_reason is not null or v_now < v_release_at then
    v_metadata := coalesce(article.editorial_metadata,'{}'::jsonb) - 'publication_attention';
    v_metadata := v_metadata || jsonb_build_object(
      'publication_requested_at',v_requested_at,
      'qa_release_at',v_release_at,
      'qa_mode','prepublication_45s',
      'qa_nonblocking',false,
      'qa_rule','current_version_qa_source_media_and_duplicate_gate_before_release',
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

create or replace function public.run_publication_watchdog()
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  article record;
  v_release_at timestamptz;
  v_qa_state jsonb;
begin
  for article in
    select a.id, a.publish_at
    from public.articles a
    where a.status = 'scheduled'::public.article_status
      and not exists (
        select 1
        from public.publication_watchdog_events e
        where e.article_id = a.id
          and e.issue_type = 'blocked'
          and e.resolved_at is null
          and coalesce(e.details->>'terminal','false') = 'true'
      )
      and public.article_qa_release_at(a.editorial_metadata, a.publish_at) is not null
      and public.article_qa_release_at(a.editorial_metadata, a.publish_at) <= v_now
    order by a.publish_at
    for update skip locked
  loop
    begin
      perform public.publish_article_safely(article.id);
    exception when others then
      insert into public.publication_watchdog_events(article_id, issue_type, reason, details)
      values (
        article.id,
        'publish_failed',
        sqlstate,
        jsonb_build_object(
          'source', 'publication_watchdog',
          'message', sqlerrm,
          'publish_at', article.publish_at,
          'checked_at', v_now
        )
      )
      on conflict (article_id, issue_type)
        where resolved_at is null and issue_type in ('blocked', 'publish_failed')
      do update
        set reason = excluded.reason,
            details = excluded.details
      where public.publication_watchdog_events.reason is distinct from excluded.reason
         or public.publication_watchdog_events.details->>'message' is distinct from excluded.details->>'message'
         or public.publication_watchdog_events.details->'publish_at' is distinct from excluded.details->'publish_at';
    end;
  end loop;

  for article in
    select a.id,
           a.publish_at,
           public.article_qa_release_at(a.editorial_metadata, a.publish_at) as release_at
    from public.articles a
    where a.status = 'scheduled'::public.article_status
      and not exists (
        select 1
        from public.publication_watchdog_events e
        where e.article_id = a.id
          and e.issue_type = 'blocked'
          and e.resolved_at is null
          and coalesce(e.details->>'terminal','false') = 'true'
      )
      and public.article_qa_release_at(a.editorial_metadata, a.publish_at) is not null
      and public.article_qa_release_at(a.editorial_metadata, a.publish_at) <= v_now - interval '2 minutes'
  loop
    v_release_at := article.release_at;
    v_qa_state := public.article_current_qa_state(article.id);

    insert into public.publication_watchdog_events(article_id, issue_type, reason, details)
    values (
      article.id,
      'stalled_scheduled',
      'scheduled_past_qa_release_at',
      jsonb_build_object(
        'source', 'publication_watchdog',
        'qa_release_at', v_release_at,
        'checked_at', v_now,
        'overdue_seconds', greatest(0, extract(epoch from (v_now - v_release_at))::bigint),
        'qa_state', v_qa_state
      )
    )
    on conflict (article_id, issue_type)
      where resolved_at is null and issue_type = 'stalled_scheduled'
    do update set
      reason = excluded.reason,
      details = excluded.details;
  end loop;

  update public.publication_watchdog_events e
  set resolved_at = coalesce(e.resolved_at, v_now)
  where e.resolved_at is null
    and e.issue_type in ('blocked', 'publish_failed')
    and exists (
      select 1
      from public.articles a
      where a.id = e.article_id
        and a.status = 'published'::public.article_status
    );

  update public.publication_watchdog_events e
  set resolved_at = coalesce(e.resolved_at, v_now)
  where e.resolved_at is null
    and e.issue_type = 'stalled_scheduled'
    and exists (
      select 1
      from public.articles a
      where a.id = e.article_id
        and (
          a.status <> 'scheduled'::public.article_status
          or exists (
            select 1
            from public.publication_watchdog_events b
            where b.article_id = a.id
              and b.issue_type = 'blocked'
              and b.resolved_at is null
              and coalesce(b.details->>'terminal','false') = 'true'
          )
          or public.article_qa_release_at(a.editorial_metadata, a.publish_at) is null
          or public.article_qa_release_at(a.editorial_metadata, a.publish_at) > v_now - interval '2 minutes'
        )
    );
end;
$function$;

update public.articles
set editorial_metadata = coalesce(editorial_metadata,'{}'::jsonb) - 'publication_attention'
where editorial_metadata ? 'publication_attention';
