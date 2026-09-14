create or replace function public.article_qa_minimum_buffer()
returns interval
language sql
immutable
as $$
  select interval '45 seconds';
$$;

create or replace function public.article_qa_target_release_at(
  p_metadata jsonb,
  p_publish_at timestamptz,
  p_requested_at timestamptz
)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select coalesce(
    public.article_qa_release_at(p_metadata, p_publish_at),
    greatest(
      coalesce(p_publish_at, p_requested_at),
      p_requested_at + public.article_qa_minimum_buffer()
    )
  );
$$;

create or replace function public.apply_prepublication_qa_buffer()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_requested_at timestamptz;
  v_release_at timestamptz;
  v_existing_release timestamptz;
  v_entering_scheduled boolean := false;
  v_entering_published boolean := false;
begin
  v_entering_scheduled := new.status = 'scheduled'::public.article_status
    and (tg_op = 'INSERT' or old.status is distinct from 'scheduled'::public.article_status);
  v_entering_published := new.status = 'published'::public.article_status
    and (tg_op = 'INSERT' or old.status is distinct from 'published'::public.article_status);

  begin
    v_existing_release := nullif(new.editorial_metadata->>'qa_release_at','')::timestamptz;
  exception when others then
    v_existing_release := null;
  end;

  if v_entering_scheduled then
    begin
      v_requested_at := nullif(new.editorial_metadata->>'publication_requested_at','')::timestamptz;
    exception when others then
      v_requested_at := null;
    end;

    v_requested_at := coalesce(v_requested_at, v_now);
    v_release_at := public.article_qa_target_release_at(
      new.editorial_metadata - 'qa_release_at',
      new.publish_at,
      v_requested_at
    );

    new.publish_at := v_release_at;
    new.published_at := null;
    new.editorial_metadata := coalesce(new.editorial_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'qa_mode','prepublication_45s',
        'qa_nonblocking',false,
        'qa_scheduled_at',v_requested_at,
        'qa_release_at',v_release_at,
        'qa_rule','current_version_qa_source_and_media_gate_before_release',
        'qa_breaking',coalesce(new.is_breaking,false)
      );
    return new;
  end if;

  if v_entering_published then
    if v_existing_release is not null then
      new.publish_at := greatest(coalesce(new.publish_at, v_existing_release), v_existing_release);
      new.published_at := greatest(coalesce(new.published_at, v_existing_release), v_existing_release);
      return new;
    end if;

    begin
      v_requested_at := nullif(new.editorial_metadata->>'publication_requested_at','')::timestamptz;
    exception when others then
      v_requested_at := null;
    end;
    v_requested_at := coalesce(v_requested_at, v_now);
    v_release_at := public.article_qa_target_release_at(
      new.editorial_metadata - 'qa_release_at',
      new.publish_at,
      v_requested_at
    );
    new.publish_at := v_release_at;
    new.published_at := v_release_at;
    new.editorial_metadata := coalesce(new.editorial_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'qa_mode','prepublication_45s',
        'qa_nonblocking',false,
        'qa_scheduled_at',v_requested_at,
        'qa_release_at',v_release_at,
        'qa_rule','current_version_qa_source_and_media_gate_before_release',
        'qa_breaking',coalesce(new.is_breaking,false)
      );
    return new;
  end if;

  if v_existing_release is not null and new.status = 'published'::public.article_status then
    if new.publish_at is null or new.publish_at < v_existing_release then new.publish_at := v_existing_release; end if;
    if new.published_at is null or new.published_at < v_existing_release then new.published_at := v_existing_release; end if;
  end if;

  return new;
end;
$$;

create or replace function public.publish_article_safely(p_article_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  article public.articles%rowtype;
  media_error text;
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
  media_error := public.article_media_publication_error(article.hero_media_id,article.hero_url);
  v_qa_state := public.article_current_qa_state(article.id);

  if coalesce(v_qa_state #>> '{source_quality,gate}','block')='block' then
    v_block_reason := 'source_quality:' || coalesce(v_qa_state #>> '{source_quality,reason}','insufficient');
  elsif coalesce(v_qa_state->>'qa_status','missing') not in ('passed','warnings') then
    v_block_reason := case when coalesce((v_qa_state->>'run_count')::int,0)>=4 then 'qa_unstable_version' else 'qa_not_complete_for_current_version' end;
  elsif media_error is not null then
    v_block_reason := media_error;
  end if;

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
