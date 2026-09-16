alter table public.article_qa_runs
  add column if not exists reclaim_count integer not null default 0;

create or replace function public.reclaim_stale_article_qa_jobs(
  p_timeout interval default interval '10 minutes'
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count integer;
begin
  with stale as (
    select id, reclaim_count
    from public.article_qa_runs
    where status = 'running'
      and finished_at is null
      and started_at is not null
      and started_at < clock_timestamp() - greatest(coalesce(p_timeout, interval '10 minutes'), interval '1 minute')
    for update skip locked
  )
  update public.article_qa_runs j
     set status = case when stale.reclaim_count >= 2 then 'failed' else 'pending' end,
         started_at = case when stale.reclaim_count >= 2 then j.started_at else null end,
         finished_at = case when stale.reclaim_count >= 2 then clock_timestamp() else null end,
         claim_token = null,
         reclaim_count = stale.reclaim_count + 1,
         warnings = coalesce(j.warnings, '[]'::jsonb) || jsonb_build_array(
           case when stale.reclaim_count >= 2 then 'qa_reclaim_exhausted' else 'qa_reclaimed_after_timeout' end
         ),
         updated_at = clock_timestamp()
    from stale
   where j.id = stale.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
