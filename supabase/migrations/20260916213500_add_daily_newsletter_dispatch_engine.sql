create table if not exists public.newsletter_dispatches (
  id uuid primary key default gen_random_uuid(),
  newsletter text not null default 'daily' check (newsletter = 'daily'),
  local_date date not null,
  article_ids uuid[] not null default '{}',
  status text not null default 'running' check (status in ('running','complete','partial')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (newsletter, local_date)
);

create table if not exists public.newsletter_deliveries (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.newsletter_dispatches(id) on delete cascade,
  subscriber_id uuid not null references public.newsletter_subscribers(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','running','sent','failed')),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_status integer,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dispatch_id, subscriber_id)
);

alter table public.newsletter_dispatches enable row level security;
alter table public.newsletter_deliveries enable row level security;
revoke all on public.newsletter_dispatches from anon, authenticated;
revoke all on public.newsletter_deliveries from anon, authenticated;

create or replace function public.newsletter_daily_articles(p_now timestamptz default now())
returns table(id uuid, slug text, headline text, deck text, published_at timestamptz)
language sql security definer set search_path = public as $$
  select a.id, a.slug, coalesce(nullif(a.frontpage_headline,''), a.headline), a.deck, a.published_at
  from public.articles a
  where a.status = 'published' and a.published_at is not null and a.published_at >= p_now - interval '24 hours'
  order by a.published_at desc limit 8;
$$;

create or replace function public.newsletter_begin_daily_dispatch(p_local_date date, p_article_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.newsletter_dispatches(newsletter, local_date, article_ids)
  values ('daily', p_local_date, coalesce(p_article_ids, '{}'::uuid[]))
  on conflict (newsletter, local_date) do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.newsletter_dispatches where newsletter='daily' and local_date=p_local_date; end if;
  return v_id;
end; $$;

create or replace function public.newsletter_claim_daily_deliveries(p_dispatch_id uuid, p_limit integer default 50)
returns table(delivery_id uuid, email text, unsubscribe_token uuid)
language plpgsql security definer set search_path = public as $$
begin
  if p_limit < 1 or p_limit > 200 then raise exception 'invalid_limit'; end if;
  if not exists(select 1 from public.newsletter_dispatches where id=p_dispatch_id and status='running') then return; end if;

  insert into public.newsletter_deliveries(dispatch_id, subscriber_id)
  select p_dispatch_id, s.id
  from public.newsletter_subscribers s
  where s.newsletter='daily' and s.status='active'
    and not exists (select 1 from public.newsletter_deliveries d where d.dispatch_id=p_dispatch_id and d.subscriber_id=s.id)
  order by s.id limit p_limit on conflict do nothing;

  return query
  with picked as (
    select d.id from public.newsletter_deliveries d
    where d.dispatch_id=p_dispatch_id and d.status='pending'
    order by d.created_at, d.id limit p_limit for update skip locked
  ), claimed as (
    update public.newsletter_deliveries d set status='running', claimed_at=now(), updated_at=now()
    from picked p where d.id=p.id returning d.id, d.subscriber_id
  )
  select c.id, s.email, s.unsubscribe_token from claimed c
  join public.newsletter_subscribers s on s.id=c.subscriber_id where s.status='active';
end; $$;

create or replace function public.newsletter_mark_daily_delivery(p_delivery_id uuid, p_ok boolean, p_provider_status integer default null, p_error_code text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update public.newsletter_deliveries
  set status=case when p_ok then 'sent' else 'failed' end,
      sent_at=case when p_ok then now() else sent_at end,
      provider_status=p_provider_status,
      error_code=case when p_ok then null else left(coalesce(p_error_code,'send_failed'),120) end,
      updated_at=now()
  where id=p_delivery_id and status='running';
  get diagnostics v_count=row_count; return v_count>0;
end; $$;

create or replace function public.newsletter_finish_daily_dispatch(p_dispatch_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sent integer; v_failed integer; v_open integer; v_missing integer; v_status text;
begin
  select count(*) filter(where status='sent'), count(*) filter(where status='failed'), count(*) filter(where status in ('pending','running'))
  into v_sent,v_failed,v_open from public.newsletter_deliveries where dispatch_id=p_dispatch_id;
  select count(*) into v_missing from public.newsletter_subscribers s
  where s.newsletter='daily' and s.status='active'
    and not exists(select 1 from public.newsletter_deliveries d where d.dispatch_id=p_dispatch_id and d.subscriber_id=s.id);
  if v_open=0 and v_missing=0 then
    v_status:=case when v_failed=0 then 'complete' else 'partial' end;
    update public.newsletter_dispatches set status=v_status,completed_at=now(),sent_count=v_sent,failed_count=v_failed where id=p_dispatch_id;
  else
    v_status:='running'; update public.newsletter_dispatches set sent_count=v_sent,failed_count=v_failed where id=p_dispatch_id;
  end if;
  return jsonb_build_object('status',v_status,'sent',v_sent,'failed',v_failed,'open',v_open,'missing',v_missing);
end; $$;

revoke all on function public.newsletter_daily_articles(timestamptz) from public, anon, authenticated;
revoke all on function public.newsletter_begin_daily_dispatch(date,uuid[]) from public, anon, authenticated;
revoke all on function public.newsletter_claim_daily_deliveries(uuid,integer) from public, anon, authenticated;
revoke all on function public.newsletter_mark_daily_delivery(uuid,boolean,integer,text) from public, anon, authenticated;
revoke all on function public.newsletter_finish_daily_dispatch(uuid) from public, anon, authenticated;
grant execute on function public.newsletter_daily_articles(timestamptz) to service_role;
grant execute on function public.newsletter_begin_daily_dispatch(date,uuid[]) to service_role;
grant execute on function public.newsletter_claim_daily_deliveries(uuid,integer) to service_role;
grant execute on function public.newsletter_mark_daily_delivery(uuid,boolean,integer,text) to service_role;
grant execute on function public.newsletter_finish_daily_dispatch(uuid) to service_role;
