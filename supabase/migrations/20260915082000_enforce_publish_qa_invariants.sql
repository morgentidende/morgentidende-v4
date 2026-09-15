-- Close the direct status='published' bypass.
-- Keep the existing QA hash contract and evaluate the row values that are
-- actually about to be published, so a passed QA for hash A cannot release
-- modified content hash B.

create or replace function public.article_publication_error_for_values(
  p_article_id uuid,
  p_headline text,
  p_deck text,
  p_body_markdown text,
  p_hero_media_id uuid,
  p_hero_url text,
  p_source_metadata jsonb,
  p_editorial_metadata jsonb
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_hash text;
  v_qa_status text;
  v_source_quality jsonb;
  v_media_error text;
begin
  v_hash := public.article_qa_content_hash(
    p_headline,
    p_deck,
    p_body_markdown,
    p_hero_media_id,
    p_hero_url,
    coalesce(p_source_metadata, '[]'::jsonb)
  );

  v_source_quality := public.evaluate_article_source_quality(
    coalesce(p_source_metadata, '[]'::jsonb),
    coalesce(p_editorial_metadata, '{}'::jsonb)
  );

  if coalesce(v_source_quality->>'gate', 'block') = 'block' then
    return 'source_quality:' || coalesce(v_source_quality->>'reason', 'insufficient');
  end if;

  select q.status
    into v_qa_status
  from public.article_qa_runs q
  where q.article_id = p_article_id
    and q.content_hash = v_hash
  order by q.created_at desc
  limit 1;

  if coalesce(v_qa_status, 'missing') not in ('passed', 'warnings') then
    return 'qa_not_complete_for_current_version';
  end if;

  v_media_error := public.article_media_publication_error(p_hero_media_id, p_hero_url);
  if v_media_error is not null then
    return v_media_error;
  end if;

  return null;
end;
$$;

create or replace function public.enforce_publish_qa_invariants()
returns trigger
language plpgsql
set search_path = public
as $$
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

    if v_error is not null then
      raise exception 'publish_blocked: %', v_error;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_publish_qa_invariants on public.articles;
create trigger trg_enforce_publish_qa_invariants
before insert or update of status
on public.articles
for each row
execute function public.enforce_publish_qa_invariants();

-- Make the normal safe-publish entry point use the same invariant helper.
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
begin
  select * into article from public.articles where id=p_article_id for update;
  if not found then raise exception 'article not found: %',p_article_id; end if;
  if article.status='published'::public.article_status then return article.id; end if;

  begin v_requested_at := nullif(article.editorial_metadata->>'publication_requested_at','')::timestamptz;
  exception when others then v_requested_at := null; end;
  v_requested_at := coalesce(v_requested_at,v_now);
  v_release_at := public.article_qa_target_release_at(
    article.editorial_metadata,
    article.publish_at,
    v_requested_at
  );
  v_qa_state := public.article_current_qa_state(article.id);
  v_block_reason := public.article_publication_error_for_values(
    article.id,
    article.headline,
    article.deck,
    article.body_markdown,
    article.hero_media_id,
    article.hero_url,
    article.source_metadata,
    article.editorial_metadata
  );

  if v_block_reason is not null then
    insert into public.publication_watchdog_events(article_id,issue_type,reason,details)
    values(article.id,'blocked',v_block_reason,jsonb_build_object('source','publish_article_safely','qa_state',v_qa_state,'publish_at',article.publish_at,'qa_release_at',v_release_at))
    on conflict (article_id,issue_type) where resolved_at is null and issue_type in ('blocked','publish_failed')
    do update set reason=excluded.reason,details=excluded.details;
  end if;

  if v_block_reason is not null or v_now < v_release_at then
    update public.articles set status='scheduled'::public.article_status,publish_at=v_release_at,published_at=null,
      editorial_metadata=coalesce(editorial_metadata,'{}'::jsonb)||jsonb_build_object(
        'publication_requested_at',v_requested_at,
        'qa_release_at',v_release_at,
        'qa_mode','prepublication_45s',
        'qa_nonblocking',false,
        'qa_rule','current_version_qa_source_and_media_gate_before_release',
        'publication_path','safe_publish'
      )
    where id=article.id;
    return article.id;
  end if;

  update public.articles set status='published'::public.article_status,publish_at=v_release_at,published_at=v_now,
    editorial_metadata=coalesce(editorial_metadata,'{}'::jsonb)||jsonb_build_object(
      'publication_requested_at',v_requested_at,
      'qa_release_at',v_release_at,
      'qa_mode','prepublication_45s',
      'qa_nonblocking',false,
      'qa_rule','current_version_qa_source_and_media_gate_before_release',
      'publication_path','safe_publish',
      'qa_published_hash',v_qa_state->>'content_hash',
      'source_quality_at_publish',v_qa_state->'source_quality'
    )
  where id=article.id;

  update public.publication_watchdog_events set resolved_at=coalesce(resolved_at,v_now)
  where article_id=article.id and resolved_at is null and issue_type in ('blocked','publish_failed');
  return article.id;
end;
$$;
