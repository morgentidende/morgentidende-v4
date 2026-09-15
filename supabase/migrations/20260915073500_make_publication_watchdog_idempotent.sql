-- Keep the existing publication watchdog cadence and gate semantics, but stop
-- rewriting unchanged blocked state every sweep. `checked_at` now advances only
-- when the meaningful watchdog state changes.

create or replace function public.run_publication_watchdog()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  article record;
  media_error text;
  v_release_at timestamptz;
  v_qa_state jsonb;
  v_block_reason text;
  v_watchdog jsonb;
begin
  for article in
    select a.id,a.status,a.publish_at,a.hero_media_id,a.hero_url,a.editorial_metadata
    from public.articles a
    where a.status='scheduled'::public.article_status
      and public.article_qa_release_at(a.editorial_metadata,a.publish_at) is not null
      and public.article_qa_release_at(a.editorial_metadata,a.publish_at)<=v_now
    order by a.publish_at for update skip locked
  loop
    v_release_at := public.article_qa_release_at(article.editorial_metadata,article.publish_at);
    v_qa_state := public.article_current_qa_state(article.id);
    media_error := public.article_media_publication_error(article.hero_media_id,article.hero_url);
    v_block_reason := null;

    if coalesce(v_qa_state #>> '{source_quality,gate}','block')='block' then
      v_block_reason := 'source_quality:' || coalesce(v_qa_state #>> '{source_quality,reason}','insufficient');
    elsif coalesce(v_qa_state->>'qa_status','missing') not in ('passed','warnings') then
      v_block_reason := case when coalesce((v_qa_state->>'run_count')::int,0)>=4 then 'qa_unstable_version' else 'qa_not_complete_for_current_version' end;
    elsif media_error is not null then
      v_block_reason := media_error;
    end if;

    if v_block_reason is not null then
      insert into public.publication_watchdog_events(article_id,issue_type,reason,details)
      values(
        article.id,
        'blocked',
        v_block_reason,
        jsonb_build_object(
          'source','publication_watchdog',
          'publish_at',article.publish_at,
          'qa_release_at',v_release_at,
          'checked_at',v_now,
          'qa_state',v_qa_state
        )
      )
      on conflict (article_id,issue_type)
        where resolved_at is null and issue_type in ('blocked','publish_failed')
      do update set
        reason=excluded.reason,
        details=excluded.details
      where public.publication_watchdog_events.reason is distinct from excluded.reason
         or public.publication_watchdog_events.details->'qa_state' is distinct from excluded.details->'qa_state'
         or public.publication_watchdog_events.details->'publish_at' is distinct from excluded.details->'publish_at'
         or public.publication_watchdog_events.details->'qa_release_at' is distinct from excluded.details->'qa_release_at';

      v_watchdog := coalesce(article.editorial_metadata->'publication_watchdog','{}'::jsonb);

      if v_watchdog->>'state' is distinct from 'blocked'
         or v_watchdog->>'reason' is distinct from v_block_reason
         or v_watchdog->'qa_state' is distinct from v_qa_state
         or v_watchdog->'qa_release_at' is distinct from to_jsonb(v_release_at) then
        update public.articles
        set editorial_metadata = coalesce(editorial_metadata,'{}'::jsonb)
          || jsonb_build_object(
            'publication_watchdog',
            jsonb_build_object(
              'state','blocked',
              'reason',v_block_reason,
              'checked_at',v_now,
              'qa_release_at',v_release_at,
              'qa_state',v_qa_state
            )
          )
        where id=article.id;
      end if;

      continue;
    end if;

    begin
      update public.articles set status='published'::public.article_status,
        publish_at=greatest(coalesce(publish_at,v_release_at),v_release_at),
        published_at=greatest(coalesce(published_at,v_now),v_release_at),
        editorial_metadata=coalesce(editorial_metadata,'{}'::jsonb)||jsonb_build_object(
          'publication_watchdog',jsonb_build_object('state','auto_released','checked_at',v_now,'qa_release_at',v_release_at),
          'qa_published_hash',v_qa_state->>'content_hash',
          'source_quality_at_publish',v_qa_state->'source_quality')
      where id=article.id;
      insert into public.publication_watchdog_events(article_id,issue_type,reason,details,resolved_at)
      values(article.id,'auto_released',null,jsonb_build_object('qa_release_at',v_release_at,'released_at',v_now,'qa_state',v_qa_state),v_now);
      update public.publication_watchdog_events set resolved_at=coalesce(resolved_at,v_now)
      where article_id=article.id and resolved_at is null and issue_type in ('blocked','publish_failed');
    exception when others then
      insert into public.publication_watchdog_events(article_id,issue_type,reason,details)
      values(article.id,'publish_failed',sqlstate,jsonb_build_object('source','publication_watchdog','message',sqlerrm,'publish_at',article.publish_at,'qa_release_at',v_release_at,'checked_at',v_now))
      on conflict (article_id,issue_type)
        where resolved_at is null and issue_type in ('blocked','publish_failed')
      do update set reason=excluded.reason,details=excluded.details
      where public.publication_watchdog_events.reason is distinct from excluded.reason
         or public.publication_watchdog_events.details->>'message' is distinct from excluded.details->>'message'
         or public.publication_watchdog_events.details->'publish_at' is distinct from excluded.details->'publish_at'
         or public.publication_watchdog_events.details->'qa_release_at' is distinct from excluded.details->'qa_release_at';
    end;
  end loop;

  update public.publication_watchdog_events e set resolved_at=coalesce(e.resolved_at,v_now)
  where e.resolved_at is null and e.issue_type in ('blocked','publish_failed')
    and exists(select 1 from public.articles a where a.id=e.article_id and a.status='published'::public.article_status);
end;
$$;
