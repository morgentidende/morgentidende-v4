-- Start the QA Edge Function immediately whenever a new pending QA run is queued.
-- The minute cron remains as a recovery path if an HTTP kick is missed.
create or replace function public.request_article_qa_runner()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_token text;
  v_request_id bigint;
begin
  select decrypted_secret
    into v_token
    from vault.decrypted_secrets
   where name = 'article_qa_anon_jwt'
   limit 1;

  if coalesce(v_token, '') = '' then
    return null;
  end if;

  begin
    select net.http_post(
      url := 'https://lfttxjxfggjcxmdfjndk.supabase.co/functions/v1/article-qa',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_token
      ),
      body := '{}'::jsonb
    ) into v_request_id;
  exception when others then
    -- Never make publication scheduling fail because the immediate kick failed.
    -- The existing once-per-minute QA cron remains the recovery mechanism.
    return null;
  end;

  return v_request_id;
end;
$$;

revoke all on function public.request_article_qa_runner() from public;
grant execute on function public.request_article_qa_runner() to service_role;

create or replace function public.kick_article_qa_runner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' then
    perform public.request_article_qa_runner();
  end if;
  return new;
end;
$$;

revoke all on function public.kick_article_qa_runner() from public;

drop trigger if exists trg_kick_article_qa_runner on public.article_qa_runs;
create trigger trg_kick_article_qa_runner
after insert on public.article_qa_runs
for each row
when (new.status = 'pending')
execute function public.kick_article_qa_runner();

-- With a 45-second minimum buffer, minute polling can add almost another minute.
-- pg_cron 1.6 supports second-based schedules; 10 seconds keeps the release lag small
-- without turning the watchdog into a tight loop.
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
    from cron.job
   where jobname = 'publication-watchdog'
   limit 1;

  if v_jobid is not null then
    perform cron.alter_job(v_jobid, schedule := '10 seconds');
  end if;
end;
$$;

-- Keep the existing minute QA runner active as a fallback/recovery sweep.
comment on function public.request_article_qa_runner() is
  'Asynchronously kicks the article-qa Edge Function. Failure is non-fatal because the minute cron is the recovery path.';
