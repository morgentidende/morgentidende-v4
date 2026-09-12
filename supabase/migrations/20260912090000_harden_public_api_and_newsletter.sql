-- Harden public-facing Supabase objects without changing intended site behavior.

-- Match the other public views: enforce caller RLS and add a security barrier.
alter view public.v4_public_articles set (security_invoker = true, security_barrier = true);

-- SECURITY DEFINER newsletter RPCs are intentionally callable by anonymous visitors,
-- but should not inherit EXECUTE through PUBLIC or be callable by authenticated users.
revoke all on function public.newsletter_begin_signup(text,text,text,text,text) from public;
revoke all on function public.newsletter_begin_signup(text,text,text,text,text) from authenticated;
grant execute on function public.newsletter_begin_signup(text,text,text,text,text) to anon, service_role;

revoke all on function public.newsletter_confirm_signup(text) from public;
revoke all on function public.newsletter_confirm_signup(text) from authenticated;
grant execute on function public.newsletter_confirm_signup(text) to anon, service_role;

revoke all on function public.newsletter_unsubscribe(uuid) from public;
revoke all on function public.newsletter_unsubscribe(uuid) from authenticated;
grant execute on function public.newsletter_unsubscribe(uuid) to anon, service_role;

-- Add conservative abuse guards to public newsletter signup while preserving the
-- existing double-opt-in flow used by the frontend.
create or replace function public.newsletter_begin_signup(
  p_email text,
  p_newsletter text default 'daily'::text,
  p_consent_version text default 'daily-v1-2026-09-11'::text,
  p_consent_text text default 'Jeg vil modtage Morgentidendes daglige nyhedsbrev kl. 06. Nyhedsbrevet kan indeholde annoncer og kommercielle links, herunder affiliate-links til produkter og tjenester fra tredjeparter. Jeg kan til enhver tid afmelde mig.'::text,
  p_signup_source text default 'website'::text
)
returns table(confirmation_token text, confirmation_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_token text;
  v_expires timestamptz;
  v_status text;
  v_last_sent timestamptz;
begin
  v_email := lower(trim(p_email));
  if v_email is null or length(v_email) < 3 or length(v_email) > 320 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid_email';
  end if;
  if p_newsletter <> 'daily' then
    raise exception 'unsupported_newsletter';
  end if;
  if length(coalesce(p_consent_version,'')) > 80 or length(coalesce(p_consent_text,'')) > 2000 or length(coalesce(p_signup_source,'')) > 160 then
    raise exception 'invalid_newsletter_metadata';
  end if;

  select status, last_confirmation_sent_at
    into v_status, v_last_sent
  from public.newsletter_subscribers
  where email = v_email and newsletter = 'daily'
  for update;

  if v_status = 'pending' and v_last_sent is not null and v_last_sent > now() - interval '2 minutes' then
    raise exception 'signup_rate_limited';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_expires := now() + interval '48 hours';

  insert into public.newsletter_subscribers (
    email, newsletter, status, delivery_time, consent_version, consent_text, signup_source,
    signup_at, confirmed_at, unsubscribed_at, confirmation_token_hash, confirmation_expires_at, last_confirmation_sent_at, updated_at
  ) values (
    v_email, 'daily', 'pending', '06:00', p_consent_version, p_consent_text, nullif(trim(p_signup_source), ''),
    now(), null, null, encode(digest(v_token, 'sha256'), 'hex'), v_expires, now(), now()
  )
  on conflict (email, newsletter) do update set
    status = case when newsletter_subscribers.status = 'active' then 'active' else 'pending' end,
    delivery_time = '06:00',
    consent_version = excluded.consent_version,
    consent_text = excluded.consent_text,
    signup_source = excluded.signup_source,
    signup_at = case when newsletter_subscribers.status = 'active' then newsletter_subscribers.signup_at else now() end,
    confirmation_token_hash = case when newsletter_subscribers.status = 'active' then newsletter_subscribers.confirmation_token_hash else excluded.confirmation_token_hash end,
    confirmation_expires_at = case when newsletter_subscribers.status = 'active' then newsletter_subscribers.confirmation_expires_at else excluded.confirmation_expires_at end,
    last_confirmation_sent_at = case when newsletter_subscribers.status = 'active' then newsletter_subscribers.last_confirmation_sent_at else now() end,
    updated_at = now();

  if v_status = 'active' then
    raise exception 'already_subscribed';
  end if;

  return query select v_token, v_expires;
end;
$$;

-- Keep the intended grants after CREATE OR REPLACE.
revoke all on function public.newsletter_begin_signup(text,text,text,text,text) from public;
revoke all on function public.newsletter_begin_signup(text,text,text,text,text) from authenticated;
grant execute on function public.newsletter_begin_signup(text,text,text,text,text) to anon, service_role;

-- Reject malformed confirmation tokens before doing any digest work.
create or replace function public.newsletter_confirm_signup(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  update public.newsletter_subscribers
  set status = 'active',
      confirmed_at = coalesce(confirmed_at, now()),
      confirmation_token_hash = null,
      confirmation_expires_at = null,
      updated_at = now()
  where status = 'pending'
    and confirmation_expires_at >= now()
    and confirmation_token_hash = encode(digest(p_token, 'sha256'), 'hex');
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.newsletter_confirm_signup(text) from public;
revoke all on function public.newsletter_confirm_signup(text) from authenticated;
grant execute on function public.newsletter_confirm_signup(text) to anon, service_role;
