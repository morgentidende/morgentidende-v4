create or replace function public.newsletter_claim_daily_deliveries(p_dispatch_id uuid,p_limit integer default 50)
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
  select c.id,s.email,s.unsubscribe_token,coalesce(s.email_theme,'auto'),coalesce(s.include_viden,false),coalesce(s.include_liv,false)
  from claimed c join public.newsletter_subscribers s on s.id=c.subscriber_id
  where s.status='active' and s.unsubscribed_at is null;
end;
$$;

create or replace function public.newsletter_test_recipient()
returns table(email text,unsubscribe_token uuid,email_theme text,include_viden boolean,include_liv boolean)
language sql security definer set search_path=public
as $$
  select s.email,s.unsubscribe_token,coalesce(s.email_theme,'auto'),coalesce(s.include_viden,false),coalesce(s.include_liv,false)
  from public.newsletter_subscribers s
  where s.newsletter='daily' and s.status='active' and s.unsubscribed_at is null
  order by s.confirmed_at desc nulls last,s.updated_at desc limit 2;
$$;

revoke all on function public.newsletter_claim_daily_deliveries(uuid,integer) from public,anon,authenticated;
revoke all on function public.newsletter_test_recipient() from public,anon,authenticated;
grant execute on function public.newsletter_claim_daily_deliveries(uuid,integer) to service_role;
grant execute on function public.newsletter_test_recipient() to service_role;
