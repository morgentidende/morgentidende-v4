-- Durable instrumentation for Facebook/Instagram dispatch via Metricool.
-- The existing social_posts table remains the state-machine source of truth.

alter type public.social_post_status add value if not exists 'scheduled' after 'publishing';

alter table public.social_posts
  add column if not exists provider text not null default 'metricool',
  add column if not exists provider_post_id text,
  add column if not exists provider_uuid text,
  add column if not exists provider_planner_url text,
  add column if not exists selected_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_error_code text;

create index if not exists social_posts_status_platform_idx
  on public.social_posts(status, platform, updated_at);

create index if not exists social_posts_provider_post_id_idx
  on public.social_posts(provider, provider_post_id)
  where provider_post_id is not null;

create table if not exists public.social_post_events (
  id bigint generated always as identity primary key,
  social_post_id uuid not null references public.social_posts(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete cascade,
  platform public.social_platform not null,
  event_type text not null,
  from_status public.social_post_status,
  to_status public.social_post_status,
  attempt integer,
  provider text not null default 'metricool',
  provider_post_id text,
  error_code text,
  error_message text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists social_post_events_post_time_idx
  on public.social_post_events(social_post_id, created_at desc);

create index if not exists social_post_events_time_idx
  on public.social_post_events(created_at desc);

create index if not exists social_post_events_error_idx
  on public.social_post_events(error_code, created_at desc)
  where error_code is not null;

alter table public.social_post_events enable row level security;

revoke all on table public.social_post_events from anon, authenticated;
grant select, insert on table public.social_post_events to service_role;
grant usage, select on sequence public.social_post_events_id_seq to service_role;

create or replace function public.social_posts_instrument_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text;
  v_error_code text;
begin
  if tg_op = 'INSERT' then
    insert into public.social_post_events(
      social_post_id, article_id, platform, event_type, to_status,
      attempt, provider, provider_post_id, error_code, error_message, detail
    ) values (
      new.id, new.article_id, new.platform, 'created', new.status,
      new.attempts, coalesce(new.provider, 'metricool'), new.provider_post_id,
      new.last_error_code, new.last_error,
      jsonb_build_object('scheduled_for', new.scheduled_for, 'media_kind', new.media_kind)
    );
    return new;
  end if;

  if new.attempts > old.attempts then
    new.last_attempt_at := coalesce(new.last_attempt_at, now());
  end if;

  if new.status is distinct from old.status then
    v_event_type := 'status_changed';
  elsif new.attempts is distinct from old.attempts then
    v_event_type := 'attempted';
  elsif new.provider_post_id is distinct from old.provider_post_id
     or new.provider_uuid is distinct from old.provider_uuid
     or new.provider_planner_url is distinct from old.provider_planner_url then
    v_event_type := 'provider_acknowledged';
  elsif new.last_error is distinct from old.last_error
     or new.last_error_code is distinct from old.last_error_code then
    v_event_type := 'error_updated';
  else
    return new;
  end if;

  v_error_code := new.last_error_code;

  insert into public.social_post_events(
    social_post_id, article_id, platform, event_type,
    from_status, to_status, attempt, provider, provider_post_id,
    error_code, error_message, detail
  ) values (
    new.id, new.article_id, new.platform, v_event_type,
    old.status, new.status, new.attempts, coalesce(new.provider, 'metricool'),
    new.provider_post_id, v_error_code, new.last_error,
    jsonb_build_object(
      'scheduled_for', new.scheduled_for,
      'published_at', new.published_at,
      'provider_uuid', new.provider_uuid,
      'provider_planner_url', new.provider_planner_url
    )
  );

  return new;
end;
$$;

revoke all on function public.social_posts_instrument_change() from public, anon, authenticated;

-- Trigger runs before update so last_attempt_at can be filled atomically.
drop trigger if exists social_posts_instrument_change on public.social_posts;
create trigger social_posts_instrument_change
before insert or update on public.social_posts
for each row execute function public.social_posts_instrument_change();

create or replace function public.social_post_record_event(
  p_social_post_id uuid,
  p_event_type text,
  p_detail jsonb default '{}'::jsonb,
  p_error_code text default null,
  p_error_message text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.social_posts%rowtype;
  v_id bigint;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  select * into v_post
  from public.social_posts
  where id = p_social_post_id;

  if not found then
    raise exception 'social post not found';
  end if;

  insert into public.social_post_events(
    social_post_id, article_id, platform, event_type,
    from_status, to_status, attempt, provider, provider_post_id,
    error_code, error_message, detail
  ) values (
    v_post.id, v_post.article_id, v_post.platform, p_event_type,
    v_post.status, v_post.status, v_post.attempts,
    coalesce(v_post.provider, 'metricool'), v_post.provider_post_id,
    p_error_code, p_error_message, coalesce(p_detail, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.social_post_record_event(uuid,text,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.social_post_record_event(uuid,text,jsonb,text,text) to service_role;

create or replace view public.social_dispatch_health
with (security_invoker = true)
as
select
  sp.id as social_post_id,
  sp.article_id,
  a.slug as article_slug,
  a.headline as article_headline,
  sp.platform,
  sp.status,
  sp.provider,
  sp.provider_post_id,
  sp.provider_planner_url,
  sp.attempts,
  sp.last_attempt_at,
  sp.last_error_code,
  sp.last_error,
  sp.scheduled_for,
  sp.published_at,
  sp.created_at,
  sp.updated_at,
  now() - sp.updated_at as state_age,
  case
    when sp.status = 'publishing'::public.social_post_status and sp.updated_at < now() - interval '10 minutes' then true
    when sp.status = 'ready'::public.social_post_status and sp.updated_at < now() - interval '30 minutes' then true
    when sp.status = 'scheduled'::public.social_post_status and sp.scheduled_for is not null and sp.scheduled_for < now() - interval '15 minutes' and sp.published_at is null then true
    else false
  end as stuck
from public.social_posts sp
join public.articles a on a.id = sp.article_id;

revoke all on table public.social_dispatch_health from anon, authenticated;
grant select on table public.social_dispatch_health to service_role;

comment on table public.social_post_events is 'Append-only event history for social dispatch observability. Explicit request/response events should be written through social_post_record_event; state mutations are also captured automatically.';
comment on view public.social_dispatch_health is 'Operational view for Metricool/SoMe dispatch. stuck=true flags ready/publishing/scheduled rows that have exceeded conservative age thresholds.';
