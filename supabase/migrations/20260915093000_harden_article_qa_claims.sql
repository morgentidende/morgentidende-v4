-- Make QA job ownership atomic and make all QA-owned article mutations compare-and-swap.
-- Immediate kicks and cron may overlap safely because each claim gets a unique token.

alter table public.article_qa_runs
  add column if not exists claim_token uuid;

create index if not exists article_qa_runs_pending_created_idx
  on public.article_qa_runs (created_at, id)
  where status = 'pending';

create index if not exists article_qa_runs_running_started_idx
  on public.article_qa_runs (started_at, id)
  where status = 'running';

create or replace function public.claim_article_qa_jobs(p_limit integer default 20)
returns setof public.article_qa_runs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select r.id
    from public.article_qa_runs r
    where r.status = 'pending'
    order by r.created_at asc, r.id asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  )
  update public.article_qa_runs j
     set status = 'running',
         started_at = clock_timestamp(),
         finished_at = null,
         claim_token = gen_random_uuid(),
         engine = coalesce(j.engine, 'deterministic-v2'),
         updated_at = clock_timestamp()
    from picked
   where j.id = picked.id
  returning j.*;
end;
$$;

create or replace function public.reclaim_stale_article_qa_jobs(
  p_timeout interval default interval '10 minutes'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.article_qa_runs
     set status = 'pending',
         started_at = null,
         claim_token = null,
         updated_at = clock_timestamp()
   where status = 'running'
     and finished_at is null
     and started_at is not null
     and started_at < clock_timestamp() - greatest(coalesce(p_timeout, interval '10 minutes'), interval '1 minute');

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.supersede_stale_qa_runs(
  p_article_id uuid,
  p_live_hash text,
  p_except_job_id uuid default null
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.article_qa_runs
     set status = 'superseded',
         finished_at = coalesce(finished_at, clock_timestamp()),
         updated_at = clock_timestamp(),
         warnings = coalesce(warnings, '[]'::jsonb)
           || jsonb_build_array('superseded_by_newer_article_version')
   where article_id = p_article_id
     and status in ('pending', 'running')
     and content_hash is distinct from p_live_hash
     and (p_except_job_id is null or id is distinct from p_except_job_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.article_qa_claim_matches_live(
  p_job_id uuid,
  p_claim_token uuid,
  p_expected_hash text
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_article_id uuid;
  a public.articles%rowtype;
  v_live_hash text;
begin
  select j.article_id into v_article_id
  from public.article_qa_runs j
  where j.id = p_job_id
    and j.status = 'running'
    and j.claim_token = p_claim_token
    and j.content_hash is not distinct from p_expected_hash;

  if v_article_id is null then
    return false;
  end if;

  select * into a from public.articles where id = v_article_id;
  if not found then
    return false;
  end if;

  v_live_hash := public.article_qa_content_hash(
    a.headline,
    a.deck,
    a.body_markdown,
    a.hero_media_id,
    a.hero_url,
    a.source_metadata
  );

  return v_live_hash is not distinct from p_expected_hash;
end;
$$;

create or replace function public.apply_article_qa_body_fix(
  p_job_id uuid,
  p_claim_token uuid,
  p_expected_hash text,
  p_body_markdown text
)
returns table(applied boolean, new_hash text, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.article_qa_runs%rowtype;
  a public.articles%rowtype;
  v_live_hash text;
  v_next_hash text;
begin
  select * into j
  from public.article_qa_runs
  where id = p_job_id
  for update;

  if not found
     or j.status <> 'running'
     or j.claim_token is distinct from p_claim_token then
    return query select false, null::text, 'claim_not_owned';
    return;
  end if;

  if j.content_hash is distinct from p_expected_hash then
    return query select false, j.content_hash, 'job_hash_mismatch';
    return;
  end if;

  select * into a
  from public.articles
  where id = j.article_id
  for update;

  if not found then
    update public.article_qa_runs
       set status = 'failed',
           finished_at = clock_timestamp(),
           updated_at = clock_timestamp(),
           warnings = coalesce(warnings, '[]'::jsonb) || jsonb_build_array('article_not_found')
     where id = j.id
       and status = 'running'
       and claim_token = p_claim_token;
    return query select false, null::text, 'article_not_found';
    return;
  end if;

  v_live_hash := public.article_qa_content_hash(
    a.headline,
    a.deck,
    a.body_markdown,
    a.hero_media_id,
    a.hero_url,
    a.source_metadata
  );

  if v_live_hash is distinct from p_expected_hash then
    update public.article_qa_runs
       set status = 'superseded',
           finished_at = clock_timestamp(),
           updated_at = clock_timestamp(),
           warnings = coalesce(warnings, '[]'::jsonb) || jsonb_build_array('superseded_before_qa_fix')
     where id = j.id
       and status = 'running'
       and claim_token = p_claim_token;
    return query select false, v_live_hash, 'article_hash_mismatch';
    return;
  end if;

  if p_body_markdown is not distinct from a.body_markdown then
    return query select true, v_live_hash, 'no_change';
    return;
  end if;

  -- Suppress a second QA enqueue caused by this worker's own deterministic fix.
  perform set_config('morgentidende.qa_fixing_job', j.id::text, true);

  update public.articles
     set body_markdown = p_body_markdown,
         editorial_updated_at = clock_timestamp()
   where id = a.id
  returning * into a;

  v_next_hash := public.article_qa_content_hash(
    a.headline,
    a.deck,
    a.body_markdown,
    a.hero_media_id,
    a.hero_url,
    a.source_metadata
  );

  update public.article_qa_runs
     set content_hash = v_next_hash,
         updated_at = clock_timestamp()
   where id = j.id
     and status = 'running'
     and claim_token = p_claim_token;

  if not found then
    return query select false, v_next_hash, 'claim_lost_after_fix';
    return;
  end if;

  return query select true, v_next_hash, 'ok';
end;
$$;

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

  return j;
end;
$$;

-- Extend the existing enqueue trigger so a newer article version invalidates both
-- queued and already-running older hashes. A QA-owned CAS update suppresses only
-- the redundant enqueue for its own adopted hash.
create or replace function public.enqueue_article_qa_run()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_should_enqueue boolean := false;
  v_hash text;
  v_requested_at timestamptz;
  v_run_count integer := 0;
  v_material_change boolean := false;
  v_fixing_job text := nullif(current_setting('morgentidende.qa_fixing_job', true), '');
begin
  if tg_op = 'UPDATE' then
    v_material_change :=
         old.headline is distinct from new.headline
      or old.deck is distinct from new.deck
      or old.body_markdown is distinct from new.body_markdown
      or old.hero_url is distinct from new.hero_url
      or old.hero_media_id is distinct from new.hero_media_id
      or old.source_metadata is distinct from new.source_metadata;

    if v_material_change
       and old.headline is not distinct from new.headline
       and old.deck is not distinct from new.deck
       and old.hero_url is not distinct from new.hero_url
       and old.hero_media_id is not distinct from new.hero_media_id
       and old.source_metadata is not distinct from new.source_metadata
       and regexp_replace(coalesce(old.body_markdown,''), '\s+', ' ', 'g')
           = regexp_replace(coalesce(new.body_markdown,''), '\s+', ' ', 'g') then
      v_material_change := false;
    end if;
  end if;

  if new.status = 'scheduled'::public.article_status then
    v_should_enqueue := tg_op = 'INSERT'
      or old.status is distinct from 'scheduled'::public.article_status
      or v_material_change;
  elsif new.status = 'published'::public.article_status then
    v_should_enqueue := tg_op = 'INSERT'
      or old.status is distinct from 'published'::public.article_status
      or v_material_change;
  end if;

  if not v_should_enqueue then
    return new;
  end if;

  v_hash := public.article_qa_content_hash(
    new.headline,
    new.deck,
    new.body_markdown,
    new.hero_media_id,
    new.hero_url,
    new.source_metadata
  );

  perform public.supersede_stale_qa_runs(
    new.id,
    v_hash,
    case when v_fixing_job is null then null else v_fixing_job::uuid end
  );

  -- The CAS fix owns this version and adopts the new hash on its existing run.
  if v_fixing_job is not null then
    return new;
  end if;

  begin
    v_requested_at := nullif(new.editorial_metadata->>'publication_requested_at','')::timestamptz;
  exception when others then
    v_requested_at := null;
  end;

  if new.status = 'scheduled'::public.article_status then
    select count(*) into v_run_count
    from public.article_qa_runs q
    where q.article_id = new.id
      and q.status <> 'superseded'
      and (v_requested_at is null or q.created_at >= v_requested_at - interval '1 second');

    if v_run_count >= 4 and not exists (
      select 1
      from public.article_qa_runs q
      where q.article_id = new.id
        and q.content_hash = v_hash
        and q.status in ('passed', 'warnings')
    ) then
      update public.articles
         set editorial_metadata = coalesce(editorial_metadata, '{}'::jsonb)
           || jsonb_build_object(
                'qa_stability',
                jsonb_build_object(
                  'state', 'attention_required',
                  'reason', 'too_many_prepublication_versions',
                  'checked_at', clock_timestamp()
                )
              )
       where id = new.id;
      return new;
    end if;
  end if;

  if not exists (
    select 1
    from public.article_qa_runs q
    where q.article_id = new.id
      and q.content_hash = v_hash
      and q.status in ('pending', 'running', 'passed', 'warnings')
  ) then
    insert into public.article_qa_runs(article_id, status, content_hash)
    values (new.id, 'pending', v_hash);
  end if;

  return new;
end;
$$;

revoke all on function public.claim_article_qa_jobs(integer) from public;
revoke all on function public.reclaim_stale_article_qa_jobs(interval) from public;
revoke all on function public.article_qa_claim_matches_live(uuid, uuid, text) from public;
revoke all on function public.apply_article_qa_body_fix(uuid, uuid, text, text) from public;
revoke all on function public.finish_article_qa_run(uuid, uuid, text, text, integer, jsonb, jsonb, text) from public;

grant execute on function public.claim_article_qa_jobs(integer) to service_role;
grant execute on function public.reclaim_stale_article_qa_jobs(interval) to service_role;
grant execute on function public.article_qa_claim_matches_live(uuid, uuid, text) to service_role;
grant execute on function public.apply_article_qa_body_fix(uuid, uuid, text, text) to service_role;
grant execute on function public.finish_article_qa_run(uuid, uuid, text, text, integer, jsonb, jsonb, text) to service_role;
