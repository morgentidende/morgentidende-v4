create or replace function public.claim_media_ingest_jobs(job_limit integer default 5)
returns setof public.media_ingest_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.media_ingest_jobs
  set status = case when attempts >= 3 then 'failed' else 'pending' end,
      last_error = coalesce(last_error, 'processing_timeout'),
      next_attempt_at = now(),
      updated_at = now()
  where status = 'processing'
    and updated_at < now() - interval '15 minutes';

  return query
  with picked as (
    select id
    from public.media_ingest_jobs
    where status = 'pending'
      and next_attempt_at <= now()
      and attempts < 3
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

create or replace function public.enqueue_media_ingest_job(p_article_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if coalesce(p_payload->>'source_url', '') = '' then
    raise exception 'source_url_required';
  end if;
  if coalesce((p_payload->>'commercial_use_allowed')::boolean, false) is not true
     or coalesce((p_payload->>'local_storage_allowed')::boolean, false) is not true then
    raise exception 'archive_rights_required';
  end if;
  if p_article_id is not null and not exists (select 1 from public.articles where id = p_article_id) then
    raise exception 'article_not_found';
  end if;

  insert into public.media_ingest_jobs(article_id, payload)
  values (p_article_id, p_payload - 'article_id')
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.enqueue_media_ingest_job(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_media_ingest_job(uuid, jsonb) to service_role;
