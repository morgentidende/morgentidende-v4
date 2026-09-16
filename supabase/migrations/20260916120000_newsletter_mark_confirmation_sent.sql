-- Confirmation send reservation with generation-safe reservation ids.
-- begin_signup mints a DOI token and a reservation_id atomically.
-- Concurrent callers cannot replace a live reservation.
-- mark/release only succeed when the caller's reservation_id still matches.
-- Stale reservations expire after 45 seconds so a crashed Worker cannot lock the address.

alter table public.newsletter_subscribers
  add column if not exists confirmation_send_state text not null default 'idle',
  add column if not exists confirmation_reserved_at timestamptz,
  add column if not exists confirmation_reservation_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'newsletter_subscribers_confirmation_send_state_check'
  ) then
    alter table public.newsletter_subscribers
      add constraint newsletter_subscribers_confirmation_send_state_check
      check (confirmation_send_state in ('idle', 'reserved', 'sent'));
  end if;
end $$;

-- CREATE OR REPLACE cannot change an existing function's return type.
-- Production currently returns TABLE(confirmation_token text, confirmation_expires_at timestamptz).
drop function if exists public.newsletter_begin_signup(text, text, text, text, text);

create or replace function public.newsletter_begin_signup(
  p_email text,
  p_newsletter text default 'daily'::text,
  p_consent_version text default 'daily-v1-2026-09-11'::text,
  p_consent_text text default 'Jeg vil modtage Morgentidendes daglige nyhedsbrev kl. 06. Nyhedsbrevet kan indeholde annoncer og kommercielle links, herunder affiliate-links til produkter og tjenester fra tredjeparter. Jeg kan til enhver tid afmelde mig.'::text,
  p_signup_source text default 'website'::text
)
returns table(confirmation_token text, confirmation_expires_at timestamptz, reservation_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_token text;
  v_expires timestamptz;
  v_reservation uuid;
  v_status text;
  v_last_sent timestamptz;
  v_send_state text;
  v_reserved_at timestamptz;
  v_count integer;
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

  perform pg_advisory_xact_lock(hashtext(v_email), hashtext('daily'));

  select status, last_confirmation_sent_at, confirmation_send_state, confirmation_reserved_at
    into v_status, v_last_sent, v_send_state, v_reserved_at
  from public.newsletter_subscribers
  where email = v_email and newsletter = 'daily'
  for update;

  if v_status = 'active' then
    raise exception 'already_subscribed';
  end if;

  if v_last_sent is not null and v_last_sent > now() - interval '2 minutes' then
    raise exception 'signup_rate_limited';
  end if;

  if v_send_state = 'reserved' and v_reserved_at is not null and v_reserved_at > now() - interval '45 seconds' then
    raise exception 'signup_in_flight';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  v_reservation := gen_random_uuid();
  v_expires := now() + interval '48 hours';

  insert into public.newsletter_subscribers (
    email, newsletter, status, delivery_time, consent_version, consent_text, signup_source,
    signup_at, confirmed_at, unsubscribed_at, confirmation_token_hash, confirmation_expires_at,
    last_confirmation_sent_at, confirmation_send_state, confirmation_reserved_at, confirmation_reservation_id, updated_at
  ) values (
    v_email, 'daily', 'pending', '06:00', p_consent_version, p_consent_text, nullif(trim(p_signup_source), ''),
    now(), null, null, encode(digest(v_token, 'sha256'), 'hex'), v_expires,
    null, 'reserved', now(), v_reservation, now()
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
    confirmation_send_state = 'reserved',
    confirmation_reserved_at = now(),
    confirmation_reservation_id = excluded.confirmation_reservation_id,
    updated_at = now()
  where newsletter_subscribers.status is distinct from 'active'
    and (
      newsletter_subscribers.confirmation_send_state is distinct from 'reserved'
      or newsletter_subscribers.confirmation_reserved_at is null
      or newsletter_subscribers.confirmation_reserved_at <= now() - interval '45 seconds'
    )
    and (
      newsletter_subscribers.last_confirmation_sent_at is null
      or newsletter_subscribers.last_confirmation_sent_at <= now() - interval '2 minutes'
    );
  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'signup_in_flight';
  end if;

  return query select v_token, v_expires, v_reservation;
end;
$$;

revoke all on function public.newsletter_begin_signup(text,text,text,text,text) from public;
revoke all on function public.newsletter_begin_signup(text,text,text,text,text) from authenticated;
revoke all on function public.newsletter_begin_signup(text,text,text,text,text) from anon;
grant execute on function public.newsletter_begin_signup(text,text,text,text,text) to service_role;

create or replace function public.newsletter_mark_confirmation_sent(
  p_email text,
  p_newsletter text default 'daily'::text,
  p_reservation_id uuid default null
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
  if v_email is null or p_newsletter <> 'daily' or p_reservation_id is null then
    return false;
  end if;

  update public.newsletter_subscribers
  set last_confirmation_sent_at = now(),
      confirmation_send_state = 'sent',
      confirmation_reserved_at = null,
      confirmation_reservation_id = null,
      updated_at = now()
  where email = v_email
    and newsletter = 'daily'
    and status = 'pending'
    and confirmation_send_state = 'reserved'
    and confirmation_reservation_id = p_reservation_id;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.newsletter_mark_confirmation_sent(text,text,uuid) from public;
revoke all on function public.newsletter_mark_confirmation_sent(text,text,uuid) from authenticated;
revoke all on function public.newsletter_mark_confirmation_sent(text,text,uuid) from anon;
grant execute on function public.newsletter_mark_confirmation_sent(text,text,uuid) to service_role;

create or replace function public.newsletter_release_confirmation_reservation(
  p_email text,
  p_newsletter text default 'daily'::text,
  p_reservation_id uuid default null
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
  if v_email is null or p_newsletter <> 'daily' or p_reservation_id is null then
    return false;
  end if;

  update public.newsletter_subscribers
  set confirmation_send_state = 'idle',
      confirmation_reserved_at = null,
      confirmation_reservation_id = null,
      updated_at = now()
  where email = v_email
    and newsletter = 'daily'
    and status = 'pending'
    and confirmation_send_state = 'reserved'
    and confirmation_reservation_id = p_reservation_id;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.newsletter_release_confirmation_reservation(text,text,uuid) from public;
revoke all on function public.newsletter_release_confirmation_reservation(text,text,uuid) from authenticated;
revoke all on function public.newsletter_release_confirmation_reservation(text,text,uuid) from anon;
grant execute on function public.newsletter_release_confirmation_reservation(text,text,uuid) to service_role;
