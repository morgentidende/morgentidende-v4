-- Make media failure and QA release states explicit and remove the historical fixed 45s delay.

create or replace function public.article_qa_target_release_at(
  p_metadata jsonb,
  p_publish_at timestamptz,
  p_requested_at timestamptz
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_existing_release timestamptz;
begin
  begin
    v_existing_release := nullif(p_metadata->>'qa_release_at','')::timestamptz;
  exception when others then
    v_existing_release := null;
  end;

  if v_existing_release is not null then
    return v_existing_release;
  end if;

  -- No synthetic QA wait. Respect an intentional future publish_at; otherwise
  -- release becomes eligible as soon as current-version QA passes.
  return greatest(coalesce(p_publish_at, p_requested_at), p_requested_at);
end;
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
        'qa_mode','current_version_prepublication',
        'qa_nonblocking',false,
        'qa_scheduled_at',v_requested_at,
        'qa_release_at',v_release_at,
        'qa_rule','current_version_qa_source_media_gate_before_release',
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
        'qa_mode','current_version_prepublication',
        'qa_nonblocking',false,
        'qa_scheduled_at',v_requested_at,
        'qa_release_at',v_release_at,
        'qa_rule','current_version_qa_source_media_gate_before_release',
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

create or replace function public.mark_article_media_terminal_failure(
  p_job_id uuid,
  p_reason text,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.media_ingest_jobs%rowtype;
  a public.articles%rowtype;
  v_metadata jsonb;
begin
  select * into j
  from public.media_ingest_jobs
  where id = p_job_id
  for update;

  if not found or j.article_id is null then
    return null;
  end if;

  if j.status <> 'failed'
     or coalesce((j.result->>'terminal')::boolean, false) is not true then
    return null;
  end if;

  select * into a
  from public.articles
  where id = j.article_id
  for update;

  if not found then return null; end if;
  if a.status <> 'scheduled'::public.article_status or a.hero_media_id is not null then
    return a.id;
  end if;

  v_metadata := coalesce(a.editorial_metadata, '{}'::jsonb)
    - 'publication_requested_at'
    - 'qa_release_at'
    - 'qa_scheduled_at'
    - 'qa_mode'
    - 'qa_stability';

  v_metadata := v_metadata || jsonb_build_object(
    'publication_attention', jsonb_build_object(
      'state','attention_required',
      'reason','hero_candidates_exhausted',
      'media_job_id',j.id,
      'media_reason',coalesce(nullif(p_reason,''), j.last_error, 'media_terminal_failure'),
      'details',coalesce(p_details,'{}'::jsonb),
      'checked_at',clock_timestamp()
    )
  );

  update public.articles
  set status = 'draft'::public.article_status,
      publish_at = null,
      published_at = null,
      editorial_metadata = v_metadata
  where id = a.id;

  return a.id;
end;
$$;

revoke all on function public.mark_article_media_terminal_failure(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.mark_article_media_terminal_failure(uuid,text,jsonb) to service_role;

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

  -- Normal path: publish immediately after current-version QA succeeds.
  -- The minute release job remains a recovery path. A publish-side failure must
  -- never roll back the completed QA result.
  if j.id is not null and j.status in ('passed','warnings') then
    begin
      perform public.publish_article_safely(j.article_id);
    exception when others then
      null;
    end;
  end if;

  return j;
end;
$$;

-- Backfill canonical bridge articles that are already known to have exhausted
-- their media candidates. They should not pretend to be scheduled forever.
with terminal_media as (
  select distinct on (j.article_id)
    j.article_id,
    j.id as job_id,
    j.last_error,
    j.result
  from public.media_ingest_jobs j
  where j.article_id is not null
    and j.status = 'failed'
    and coalesce((j.result->>'terminal')::boolean, false) is true
  order by j.article_id, j.updated_at desc
)
update public.articles a
set status = 'draft'::public.article_status,
    publish_at = null,
    published_at = null,
    editorial_metadata = (
      coalesce(a.editorial_metadata,'{}'::jsonb)
      - 'publication_requested_at'
      - 'qa_release_at'
      - 'qa_scheduled_at'
      - 'qa_mode'
      - 'qa_stability'
    ) || jsonb_build_object(
      'publication_attention', jsonb_build_object(
        'state','attention_required',
        'reason','hero_candidates_exhausted',
        'media_job_id',t.job_id,
        'media_reason',coalesce(t.last_error,'media_terminal_failure'),
        'checked_at',clock_timestamp()
      )
    )
from terminal_media t
where a.id = t.article_id
  and a.created_by = 'chatgpt_scheduled_github_bridge'
  and a.status = 'scheduled'::public.article_status
  and a.hero_media_id is null
  and not exists (
    select 1 from public.media_ingest_jobs active
    where active.article_id = a.id and active.status in ('pending','processing')
  );
