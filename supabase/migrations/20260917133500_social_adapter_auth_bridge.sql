-- Reuse the existing social dispatcher Vault token all the way to the provider adapter.
-- This removes the need to copy a second shared secret between Supabase and Cloudflare.

create or replace function public.authorize_social_adapter_token(p_token text)
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

revoke all on function public.authorize_social_adapter_token(text)
  from public, authenticated, service_role;
grant execute on function public.authorize_social_adapter_token(text)
  to anon;

comment on function public.authorize_social_adapter_token(text) is
  'Anon-callable boolean verifier used only by the Cloudflare social adapter; verifies the dedicated Vault runner token without exposing it.';

update public.site_settings
set value = jsonb_set(
      value,
      '{adapter_url}',
      to_jsonb('https://morgentidende-social-publisher.morgentidende.workers.dev'::text),
      true
    ),
    updated_at = now()
where key = 'social_distribution_policy';
