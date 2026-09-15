-- Refactor the active source gate around the binary registry model without changing
-- external behavior. Keep legacy function/output names as compatibility wrappers.

create or replace function public.evaluate_article_source_policy(
  p_source_metadata jsonb,
  p_editorial_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  s jsonb;
  v_class text;
  v_authoritative int := 0;
  v_discovery_only int := 0;
  v_reference int := 0;
begin
  if jsonb_typeof(p_source_metadata) <> 'array' then
    return jsonb_build_object(
      'gate','block',
      'reason','source_metadata_not_array',
      'counts',jsonb_build_object()
    );
  end if;

  for s in select value from jsonb_array_elements(p_source_metadata)
  loop
    v_class := public.editorial_source_classification(s);
    case v_class
      when 'authoritative' then v_authoritative := v_authoritative + 1;
      when 'reference' then v_reference := v_reference + 1;
      else v_discovery_only := v_discovery_only + 1;
    end case;
  end loop;

  if v_authoritative >= 1 then
    return jsonb_build_object(
      'gate','pass',
      'reason','authoritative_source_present',
      'counts',jsonb_build_object(
        'authoritative',v_authoritative,
        'discovery_only',v_discovery_only,
        'reference',v_reference
      )
    );
  end if;

  return jsonb_build_object(
    'gate','block',
    'reason','no_authoritative_source',
    'counts',jsonb_build_object(
      'authoritative',v_authoritative,
      'discovery_only',v_discovery_only,
      'reference',v_reference
    )
  );
end;
$$;

-- Compatibility wrapper: older QA/reporting code and historical clients may still
-- call this name. It no longer implements the old multi-tier quality model.
create or replace function public.evaluate_article_source_quality(
  p_source_metadata jsonb,
  p_editorial_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select public.evaluate_article_source_policy(p_source_metadata,p_editorial_metadata);
$$;

create or replace function public.prepare_article_qa_run()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  a public.articles%rowtype;
begin
  select * into a from public.articles where id = new.article_id;
  if not found then return new; end if;
  new.content_hash := coalesce(
    new.content_hash,
    public.article_qa_content_hash(a.headline,a.deck,a.body_markdown,a.hero_media_id,a.hero_url,a.source_metadata)
  );
  -- `source_quality` is a legacy storage column name. Its JSON now contains only
  -- the binary authoritative/discovery_only policy result.
  new.source_quality := public.evaluate_article_source_policy(a.source_metadata,a.editorial_metadata);
  return new;
end;
$$;

create or replace function public.article_current_qa_state(p_article_id uuid)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  a public.articles%rowtype;
  v_hash text;
  q public.article_qa_runs%rowtype;
  v_source_policy jsonb;
  v_requested_at timestamptz;
  v_run_count int;
begin
  select * into a from public.articles where id=p_article_id;
  if not found then return jsonb_build_object('state','missing_article'); end if;

  v_hash := public.article_qa_content_hash(
    a.headline,a.deck,a.body_markdown,a.hero_media_id,a.hero_url,a.source_metadata
  );
  v_source_policy := public.evaluate_article_source_policy(a.source_metadata,a.editorial_metadata);

  select * into q
    from public.article_qa_runs
   where article_id=a.id and content_hash=v_hash
   order by created_at desc limit 1;

  begin
    v_requested_at := nullif(a.editorial_metadata->>'publication_requested_at','')::timestamptz;
  exception when others then
    v_requested_at := null;
  end;

  select count(*) into v_run_count
    from public.article_qa_runs r
   where r.article_id=a.id
     and r.status <> 'superseded'
     and (v_requested_at is null or r.created_at >= v_requested_at - interval '1 second');

  return jsonb_build_object(
    'content_hash',v_hash,
    'qa_status',coalesce(q.status,'missing'),
    'qa_finished_at',q.finished_at,
    'qa_run_id',q.id,
    -- Keep the public key for backward compatibility.
    'source_quality',v_source_policy,
    'source_policy',v_source_policy,
    'run_count',v_run_count,
    'publishable',coalesce(q.status in ('passed','warnings'),false)
      and coalesce(v_source_policy->>'gate','block') <> 'block'
  );
end;
$$;

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
  v_source_policy jsonb;
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

  v_source_policy := public.evaluate_article_source_policy(
    coalesce(p_source_metadata, '[]'::jsonb),
    coalesce(p_editorial_metadata, '{}'::jsonb)
  );

  if coalesce(v_source_policy->>'gate', 'block') = 'block' then
    -- Preserve the existing error prefix consumed by watchdog/diagnostics.
    return 'source_quality:' || coalesce(v_source_policy->>'reason', 'insufficient');
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
  if v_media_error is not null then return v_media_error; end if;
  return null;
end;
$$;

-- Regression checks: one authoritative source passes, discovery-only alone blocks,
-- and explicit editor-in-chief registry decisions continue to win.
do $$
declare
  v_result jsonb;
begin
  v_result := public.evaluate_article_source_policy(
    jsonb_build_array(jsonb_build_object('url','https://www.bangkokpost.com/test','publisher','Bangkok Post')),
    '{}'::jsonb
  );
  if v_result->>'gate' <> 'pass' then
    raise exception 'binary source policy regression: Bangkok Post must pass alone';
  end if;

  v_result := public.evaluate_article_source_policy(
    jsonb_build_array(jsonb_build_object('url','https://jihadwatch.org/test','publisher','Jihad Watch')),
    '{}'::jsonb
  );
  if v_result->>'gate' <> 'block' then
    raise exception 'binary source policy regression: discovery-only source must not pass alone';
  end if;

  if public.editorial_source_classification(
       jsonb_build_object('url','https://nationthailand.com/test','publisher','The Nation Thailand')
     ) <> 'authoritative' then
    raise exception 'binary source policy regression: The Nation Thailand must remain authoritative';
  end if;
end;
$$;
