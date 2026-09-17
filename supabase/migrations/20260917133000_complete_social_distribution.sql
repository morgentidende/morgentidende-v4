-- Complete the lean social-distribution module without coupling it to article publication.
-- A scheduled dispatcher discovers newly published articles after an explicit start_at,
-- creates idempotent Facebook/Instagram rows, and hands them to the provider adapter.
-- The module ships disabled; enabling it is a separate operational switch.

insert into public.site_settings(key, value, updated_at)
values (
  'social_distribution_policy',
  jsonb_build_object(
    'enabled', false,
    'start_at', null,
    'base_url', 'https://morgentidende.dk',
    'timezone', 'Europe/Copenhagen',
    'min_provider_lead_seconds', 120,
    'facebook', jsonb_build_object(
      'enabled', true,
      'delay_seconds', 120,
      'exclude_categories', jsonb_build_array()
    ),
    'instagram', jsonb_build_object(
      'enabled', true,
      'delay_seconds', 300,
      'exclude_categories', jsonb_build_array()
    )
  ),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'social_dispatcher_runner_token'
  ) THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'social_dispatcher_runner_token',
      'Dedicated internal token for the Morgentidende social-dispatcher cron/Edge worker'
    );
  END IF;
END
$$;

create or replace function public.authorize_social_dispatcher_runner(p_token text)
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
      where s.name = 'social_dispatcher_runner_token'
        and s.decrypted_secret = p_token
    ),
    false
  );
$$;

revoke all on function public.authorize_social_dispatcher_runner(text)
  from public, anon, authenticated;
grant execute on function public.authorize_social_dispatcher_runner(text)
  to service_role;

comment on function public.authorize_social_dispatcher_runner(text) is
  'Service-role-only verifier for the dedicated social-dispatcher runner token stored in Vault.';

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'morgentidende-social-dispatcher'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'morgentidende-social-dispatcher',
    '* * * * *',
    $cron$
      select net.http_post(
        url := 'https://lfttxjxfggjcxmdfjndk.supabase.co/functions/v1/social-dispatcher',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='article_qa_anon_jwt' limit 1),
          'X-Morgentidende-Social-Runner-Token',(select decrypted_secret from vault.decrypted_secrets where name='social_dispatcher_runner_token' limit 1)
        ),
        body := '{}'::jsonb
      );
    $cron$
  );
END
$$;
