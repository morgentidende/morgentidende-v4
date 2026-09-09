create table if not exists public.media_ingest_jobs (
  id uuid primary key default gen_random_uuid(),
  article_id uuid null references public.articles(id) on delete cascade,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text null,
  asset_id uuid null references public.media_assets(id) on delete set null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_ingest_jobs_pending_idx
  on public.media_ingest_jobs (status, next_attempt_at, created_at);

alter table public.media_ingest_jobs enable row level security;

revoke all on table public.media_ingest_jobs from anon, authenticated;
grant select, insert, update, delete on table public.media_ingest_jobs to service_role;

create or replace function public.claim_media_ingest_jobs(job_limit integer default 5)
returns setof public.media_ingest_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select id
    from public.media_ingest_jobs
    where status = 'pending'
      and next_attempt_at <= now()
    order by created_at
    for update skip locked
    limit greatest(1, least(coalesce(job_limit, 5), 20))
  ), updated as (
    update public.media_ingest_jobs j
    set status = 'processing',
        attempts = j.attempts + 1,
        updated_at = now()
    from picked
    where j.id = picked.id
    returning j.*
  )
  select * from updated;
end;
$$;

revoke all on function public.claim_media_ingest_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_media_ingest_jobs(integer) to service_role;
