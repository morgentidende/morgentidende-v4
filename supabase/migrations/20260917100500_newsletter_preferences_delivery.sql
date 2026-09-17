create or replace function public.newsletter_preferences_get(p_token uuid)
returns table(email_theme text, include_viden boolean, include_liv boolean)
language sql
security definer
set search_path = public
as $$
  select ns.email_theme, ns.include_viden, ns.include_liv
  from public.newsletter_subscribers ns
  where ns.unsubscribe_token = p_token
    and ns.newsletter = 'daily'
    and ns.status = 'active'
    and ns.unsubscribed_at is null
  limit 1;
$$;

create or replace function public.newsletter_preferences_update(
  p_token uuid,
  p_email_theme text,
  p_include_viden boolean,
  p_include_liv boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_email_theme not in ('auto','light','dark') then raise exception 'invalid email theme'; end if;
  update public.newsletter_subscribers
  set email_theme=p_email_theme, include_viden=p_include_viden, include_liv=p_include_liv, updated_at=now()
  where unsubscribe_token=p_token and newsletter='daily' and status='active' and unsubscribed_at is null;
  return found;
end;
$$;

drop function if exists public.newsletter_daily_articles(timestamptz);
create function public.newsletter_daily_articles(p_now timestamptz default now())
returns table(id uuid, slug text, headline text, deck text, published_at timestamptz, category_slug text)
language sql
security definer
set search_path = public
as $$
  select a.id,a.slug,coalesce(nullif(a.frontpage_headline,''),a.headline),a.deck,a.published_at,c.slug
  from public.articles a left join public.categories c on c.id=a.category_id
  where a.status='published' and a.published_at is not null and a.published_at>=p_now-interval '24 hours'
  order by a.published_at desc limit 12;
$$;

drop function if exists public.newsletter_claim_daily_deliveries(uuid,integer);
create function public.newsletter_claim_daily_deliveries(p_dispatch_id uuid,p_limit integer default 50)
returns table(delivery_id uuid,email text,unsubscribe_token uuid,email_theme text,include_viden boolean,include_liv boolean)
language plpgsql security definer set search_path=public
as $$
begin
  if p_limit<1 or p_limit>200 then raise exception 'invalid_limit'; end if;
  if not exists(select 1 from public.newsletter_dispatches where id=p_dispatch_id and status='running') then return; end if;
  insert into public.newsletter_deliveries(dispatch_id,subscriber_id)
  select p_dispatch_id,s.id from public.newsletter_subscribers s
  where s.newsletter='daily' and s.status='active' and s.unsubscribed_at is null
    and not exists(select 1 from public.newsletter_deliveries d where d.dispatch_id=p_dispatch_id and d.subscriber_id=s.id)
  order by s.id limit p_limit on conflict do nothing;
  return query
  with picked as (
    select d.id from public.newsletter_deliveries d where d.dispatch_id=p_dispatch_id and d.status='pending'
    order by d.created_at,d.id limit p_limit for update skip locked
  ), claimed as (
    update public.newsletter_deliveries d set status='running',claimed_at=now(),updated_at=now()
    from picked p where d.id=p.id returning d.id,d.subscriber_id
  )
  select c.id,s.email,s.unsubscribe_token,coalesce(s.email_theme,'auto'),coalesce(s.include_viden,true),coalesce(s.include_liv,true)
  from claimed c join public.newsletter_subscribers s on s.id=c.subscriber_id
  where s.status='active' and s.unsubscribed_at is null;
end;
$$;

drop function if exists public.newsletter_test_recipient();
create function public.newsletter_test_recipient()
returns table(email text,unsubscribe_token uuid,email_theme text,include_viden boolean,include_liv boolean)
language sql security definer set search_path=public
as $$
  select s.email,s.unsubscribe_token,coalesce(s.email_theme,'auto'),coalesce(s.include_viden,true),coalesce(s.include_liv,true)
  from public.newsletter_subscribers s
  where s.newsletter='daily' and s.status='active' and s.unsubscribed_at is null
  order by s.confirmed_at desc nulls last,s.updated_at desc limit 2;
$$;

revoke all on function public.newsletter_preferences_get(uuid) from public,anon,authenticated;
revoke all on function public.newsletter_preferences_update(uuid,text,boolean,boolean) from public,anon,authenticated;
revoke all on function public.newsletter_daily_articles(timestamptz) from public,anon,authenticated;
revoke all on function public.newsletter_claim_daily_deliveries(uuid,integer) from public,anon,authenticated;
revoke all on function public.newsletter_test_recipient() from public,anon,authenticated;
grant execute on function public.newsletter_preferences_get(uuid) to service_role;
grant execute on function public.newsletter_preferences_update(uuid,text,boolean,boolean) to service_role;
grant execute on function public.newsletter_daily_articles(timestamptz) to service_role;
grant execute on function public.newsletter_claim_daily_deliveries(uuid,integer) to service_role;
grant execute on function public.newsletter_test_recipient() to service_role;
