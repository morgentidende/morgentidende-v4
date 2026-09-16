-- Minting a confirmation token must not start the 2-minute resend lock.
-- The lock is applied only after SES has accepted the confirmation email.
-- Concurrent first-time signups for the same email are serialized with a
-- transaction-scoped advisory lock so only one minted token can be stored.

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

  -- Serialize mint+upsert for this (email, newsletter) even when no row exists yet.
  perform pg_advisory_xact_lock(hashtext(v_email), hashtext('daily'));

  select status, last_confirmation_sent_at
    into v_status, v_last_sent
  from public.newsletter_subscribers
  where email = v_email and newsletter = 'daily'
  for update;

  if v_status = 'active' then
    raise exception 'already_subscribed';
  end if;

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
    now(), null, null, encode(digest(v_token, 'sha256'), 'hex'), v_expires, null, now()
  )
  on conflict (email, newsletter) do update set
    status = 'pending',
    delivery_time = '06:00',
    consent_version = excluded.consent_version,
    consent_text = excluded.consent_text,
    signup_source = excluded.signup_source,
    signup_at = now(),
    confirmation_token_hash = excluded.confirmation_token_hash,
    confirmation_expires_at = excluded.confirmation_expires_at,
    updated_at = now()
  where newsletter_subscribers.status is distinct from 'active';

  return query select v_token, v_expires;
end;
$$;

revoke all on function public.newsletter_begin_signup(text,text,text,text,text) from public;
revoke all on function public.newsletter_begin_signup(text,text,text,text,text) from authenticated;
revoke all on function public.newsletter_begin_signup(text,text,text,text,text) from anon;
grant execute on function public.newsletter_begin_signup(text,text,text,text,text) to service_role;

create or replace function public.newsletter_mark_confirmation_sent(
  p_email text,
  p_newsletter text default 'daily'::text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_count integer;
begin
  v_email := lower(trim(p_email));
  if v_email is null or p_newsletter <> 'daily' then
    return false;
  end if;

  update public.newsletter_subscribers
  set last_confirmation_sent_at = now(),
      updated_at = now()
  where email = v_email
    and newsletter = 'daily'
    and status = 'pending';
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.newsletter_mark_confirmation_sent(text,text) from public;
revoke all on function public.newsletter_mark_confirmation_sent(text,text) from authenticated;
revoke all on function public.newsletter_mark_confirmation_sent(text,text) from anon;
grant execute on function public.newsletter_mark_confirmation_sent(text,text) to service_role;
