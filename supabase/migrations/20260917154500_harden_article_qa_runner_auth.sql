-- Add a dedicated second factor for the privileged article-qa Edge worker.
-- The token is generated and stored entirely inside Vault; its plaintext never
-- belongs in source control or an Edge environment variable.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'article_qa_runner_token'
  ) THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'article_qa_runner_token',
      'Dedicated internal token for the Morgentidende article-qa cron/Edge worker'
    );
  END IF;
END
$$;

create or replace function public.authorize_article_qa_runner(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(p_token), '') is not null
    and exists (
      select 1
      from vault.decrypted_secrets s
      where s.name = 'article_qa_runner_token'
        and s.decrypted_secret = p_token
    ),
    false
  );
$$;

revoke all on function public.authorize_article_qa_runner(text)
  from public, anon, authenticated;
grant execute on function public.authorize_article_qa_runner(text)
  to service_role;

comment on function public.authorize_article_qa_runner(text) is
  'Service-role-only boolean verifier for the dedicated article-qa runner token stored in Vault.';

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'morgentidende-article-qa-runner'
  LIMIT 1;

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'morgentidende-article-qa-runner cron job not found';
  END IF;

  PERFORM cron.alter_job(
    v_job_id,
    command := $cron$
      select net.http_post(
        url := 'https://lfttxjxfggjcxmdfjndk.supabase.co/functions/v1/article-qa',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='article_qa_anon_jwt' limit 1),
          'X-Morgentidende-QA-Token',(select decrypted_secret from vault.decrypted_secrets where name='article_qa_runner_token' limit 1)
        ),
        body := '{}'::jsonb
      );
      select public.release_qa_approved_articles();
    $cron$
  );
END
$$;
