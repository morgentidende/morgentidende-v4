create policy media_ingest_jobs_deny_client on public.media_ingest_jobs
for all to anon, authenticated
using (false)
with check (false);

create index if not exists media_ingest_jobs_article_id_idx
  on public.media_ingest_jobs(article_id)
  where article_id is not null;

create index if not exists media_ingest_jobs_asset_id_idx
  on public.media_ingest_jobs(asset_id)
  where asset_id is not null;

create index if not exists media_ingest_jobs_processing_timeout_idx
  on public.media_ingest_jobs(status, updated_at)
  where status = 'processing';
