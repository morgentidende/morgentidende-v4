create table if not exists public.discovery_candidate_audit (
  id bigint generated always as identity primary key,
  run_id text not null,
  candidate_id text not null,
  article_id uuid references public.articles(id) on delete set null,
  queue_id text,
  source_pool text,
  path_used text,
  rank_position integer,
  deep_screened boolean not null default false,
  discovery_source_name text,
  discovery_source_url text,
  discovery_domain text,
  candidate_headline text,
  candidate_topic text,
  hard_negative boolean,
  decision text not null default 'unknown',
  decision_reason text,
  downstream_sources jsonb not null default '[]'::jsonb,
  semantic_assessment jsonb not null default '{}'::jsonb,
  model_name text,
  prompt_version text,
  audit_outcome text check (audit_outcome is null or audit_outcome in ('correct_reject','false_negative','correct_publish','false_positive')),
  audit_note text,
  audited_at timestamptz,
  raw_candidate jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (run_id, candidate_id)
);

create index if not exists discovery_candidate_audit_created_idx
  on public.discovery_candidate_audit (created_at desc);
create index if not exists discovery_candidate_audit_domain_idx
  on public.discovery_candidate_audit (discovery_domain, created_at desc);
create index if not exists discovery_candidate_audit_decision_idx
  on public.discovery_candidate_audit (decision, created_at desc);
create index if not exists discovery_candidate_audit_article_idx
  on public.discovery_candidate_audit (article_id) where article_id is not null;

alter table public.discovery_candidate_audit enable row level security;
revoke all on public.discovery_candidate_audit from anon, authenticated;

create or replace function public.record_discovery_candidate_audit(
  p_run_id text,
  p_candidates jsonb,
  p_article_id uuid default null,
  p_queue_id text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_ord bigint;
  v_candidate_id text;
  v_count integer := 0;
begin
  if nullif(btrim(p_run_id), '') is null then
    raise exception 'discovery_audit_run_id_required';
  end if;
  if jsonb_typeof(p_candidates) <> 'array' then
    raise exception 'discovery_audit_candidates_must_be_array';
  end if;
  if jsonb_array_length(p_candidates) > 50 then
    raise exception 'discovery_audit_too_many_candidates';
  end if;

  for v_item, v_ord in
    select value, ordinality from jsonb_array_elements(p_candidates) with ordinality
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'discovery_audit_candidate_must_be_object';
    end if;
    v_candidate_id := coalesce(nullif(btrim(v_item->>'candidate_id'), ''), 'candidate-' || v_ord::text);

    insert into public.discovery_candidate_audit (
      run_id, candidate_id, article_id, queue_id, source_pool, path_used,
      rank_position, deep_screened, discovery_source_name, discovery_source_url,
      discovery_domain, candidate_headline, candidate_topic, hard_negative,
      decision, decision_reason, downstream_sources, semantic_assessment,
      model_name, prompt_version, raw_candidate, updated_at
    ) values (
      btrim(p_run_id), v_candidate_id, p_article_id, nullif(btrim(p_queue_id), ''),
      nullif(btrim(v_item->>'source_pool'), ''), nullif(btrim(v_item->>'path_used'), ''),
      nullif(v_item->>'rank_position','')::integer,
      coalesce((v_item->>'deep_screened')::boolean, false),
      nullif(btrim(v_item->>'discovery_source_name'), ''),
      nullif(btrim(v_item->>'discovery_source_url'), ''),
      nullif(btrim(v_item->>'discovery_domain'), ''),
      nullif(btrim(v_item->>'candidate_headline'), ''),
      nullif(btrim(v_item->>'candidate_topic'), ''),
      case when v_item ? 'hard_negative' then (v_item->>'hard_negative')::boolean else null end,
      coalesce(nullif(btrim(v_item->>'decision'), ''), 'unknown'),
      nullif(btrim(v_item->>'decision_reason'), ''),
      case when jsonb_typeof(v_item->'downstream_sources')='array' then v_item->'downstream_sources' else '[]'::jsonb end,
      case when jsonb_typeof(v_item->'semantic_assessment')='object' then v_item->'semantic_assessment' else '{}'::jsonb end,
      nullif(btrim(v_item->>'model_name'), ''),
      nullif(btrim(v_item->>'prompt_version'), ''),
      v_item,
      clock_timestamp()
    )
    on conflict (run_id, candidate_id) do update set
      article_id = coalesce(excluded.article_id, public.discovery_candidate_audit.article_id),
      queue_id = coalesce(excluded.queue_id, public.discovery_candidate_audit.queue_id),
      source_pool = excluded.source_pool,
      path_used = excluded.path_used,
      rank_position = excluded.rank_position,
      deep_screened = excluded.deep_screened,
      discovery_source_name = excluded.discovery_source_name,
      discovery_source_url = excluded.discovery_source_url,
      discovery_domain = excluded.discovery_domain,
      candidate_headline = excluded.candidate_headline,
      candidate_topic = excluded.candidate_topic,
      hard_negative = excluded.hard_negative,
      decision = excluded.decision,
      decision_reason = excluded.decision_reason,
      downstream_sources = excluded.downstream_sources,
      semantic_assessment = excluded.semantic_assessment,
      model_name = excluded.model_name,
      prompt_version = excluded.prompt_version,
      raw_candidate = excluded.raw_candidate,
      updated_at = clock_timestamp();
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.record_discovery_candidate_audit(text,jsonb,uuid,text) from public, anon, authenticated;

create or replace function public.capture_article_discovery_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidates jsonb;
  v_run_id text;
begin
  v_candidates := new.editorial_metadata->'discovery_audit';
  if jsonb_typeof(v_candidates) <> 'array' or jsonb_array_length(v_candidates)=0 then
    return new;
  end if;
  v_run_id := coalesce(
    nullif(btrim(new.editorial_metadata->>'discovery_run_id'), ''),
    nullif(btrim(new.github_queue_id), ''),
    new.id::text
  );
  perform public.record_discovery_candidate_audit(v_run_id, v_candidates, new.id, new.github_queue_id);
  return new;
end;
$$;

revoke all on function public.capture_article_discovery_audit() from public, anon, authenticated;

drop trigger if exists articles_capture_discovery_audit on public.articles;
create trigger articles_capture_discovery_audit
after insert on public.articles
for each row execute function public.capture_article_discovery_audit();

create or replace function public.ingest_github_discovery_audit_payload(p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id text;
  v_queue_id text;
  v_candidates jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload_must_be_object';
  end if;
  v_run_id := nullif(btrim(coalesce(p_payload->>'run_id', p_payload->>'queue_id')), '');
  v_queue_id := nullif(btrim(p_payload->>'queue_id'), '');
  v_candidates := p_payload->'discovery_audit';
  if v_run_id is null then raise exception 'discovery_audit_run_id_required'; end if;
  if jsonb_typeof(v_candidates) <> 'array' then raise exception 'discovery_audit_candidates_must_be_array'; end if;
  return public.record_discovery_candidate_audit(v_run_id, v_candidates, null, v_queue_id);
end;
$$;

revoke all on function public.ingest_github_discovery_audit_payload(jsonb) from public, anon, authenticated;
