create or replace function public.run_publication_watchdog()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  article record;
  v_status public.article_status;
begin
  for article in
    select a.id, a.publish_at
    from public.articles a
    where a.status = 'scheduled'::public.article_status
      and public.article_qa_release_at(a.editorial_metadata, a.publish_at) is not null
      and public.article_qa_release_at(a.editorial_metadata, a.publish_at) <= v_now
    order by a.publish_at
    for update skip locked
  loop
    begin
      perform public.publish_article_safely(article.id);

      select a.status into v_status
      from public.articles a
      where a.id = article.id;

      if v_status = 'published'::public.article_status then
        insert into public.publication_watchdog_events(article_id, issue_type, reason, details, resolved_at)
        values (
          article.id,
          'auto_released',
          null,
          jsonb_build_object(
            'source', 'publication_watchdog',
            'released_via', 'publish_article_safely',
            'checked_at', v_now
          ),
          v_now
        );
      end if;
    exception when others then
      insert into public.publication_watchdog_events(article_id, issue_type, reason, details)
      values (
        article.id,
        'publish_failed',
        sqlstate,
        jsonb_build_object(
          'source', 'publication_watchdog',
          'message', sqlerrm,
          'publish_at', article.publish_at,
          'checked_at', v_now
        )
      )
      on conflict (article_id, issue_type)
        where resolved_at is null and issue_type in ('blocked', 'publish_failed')
      do update
        set reason = excluded.reason,
            details = excluded.details
      where public.publication_watchdog_events.reason is distinct from excluded.reason
         or public.publication_watchdog_events.details->>'message' is distinct from excluded.details->>'message'
         or public.publication_watchdog_events.details->'publish_at' is distinct from excluded.details->'publish_at';
    end;
  end loop;

  update public.publication_watchdog_events e
  set resolved_at = coalesce(e.resolved_at, v_now)
  where e.resolved_at is null
    and e.issue_type in ('blocked', 'publish_failed')
    and exists (
      select 1
      from public.articles a
      where a.id = e.article_id
        and a.status = 'published'::public.article_status
    );
end;
$$;
