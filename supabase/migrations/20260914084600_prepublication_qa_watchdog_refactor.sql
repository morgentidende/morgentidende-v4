create or replace function public.apply_prepublication_qa_buffer()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_requested_at timestamptz;
  v_target_at timestamptz;
  v_release_at timestamptz;
  v_existing_release timestamptz;
  v_entering_scheduled boolean := false;
  v_entering_published boolean := false;
begin
  v_entering_scheduled := new.status = 'scheduled'::public.article_status
    and (tg_op = 'INSERT' or old.status is distinct from 'scheduled'::public.article_status);
  v_entering_published := new.status = 'published'::public.article_status
    and (tg_op = 'INSERT' or old.status is distinct from 'published'::public.article_status);

  begin
    v_existing_release := nullif(new.editorial_metadata->>'qa_release_at','')::timestamptz;
  exception when others then
    v_existing_release := null;
  end;

  if v_entering_scheduled then
    begin
      v_requested_at := nullif(new.editorial_metadata->>'publication_requested_at','')::timestamptz;
    exception when others then
      v_requested_at := null;
    end;

    v_requested_at := coalesce(v_requested_at, v_now);
    v_target_at := coalesce(new.publish_at, v_requested_at);
    v_release_at := greatest(v_target_at, v_requested_at + interval '2 minutes');

    new.publish_at := v_release_at;
    new.published_at := null;
    new.editorial_metadata := coalesce(new.editorial_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'qa_mode','prepublication_2m',
        'qa_nonblocking',true,
        'qa_scheduled_at',v_requested_at,
        'qa_release_at',v_release_at,
        'qa_rule','release_at_is_hard_deadline_no_qa_gate',
        'qa_breaking',coalesce(new.is_breaking,false)
      );
    return new;
  end if;

  if v_entering_published then
    if v_existing_release is not null then
      new.publish_at := greatest(coalesce(new.publish_at, v_existing_release), v_existing_release);
      new.published_at := greatest(coalesce(new.published_at, v_existing_release), v_existing_release);
      return new;
    end if;

    begin
      v_requested_at := nullif(new.editorial_metadata->>'publication_requested_at','')::timestamptz;
    exception when others then
      v_requested_at := null;
    end;
    v_requested_at := coalesce(v_requested_at, v_now);
    v_release_at := greatest(coalesce(new.publish_at, v_requested_at), v_requested_at + interval '2 minutes');
    new.publish_at := v_release_at;
    new.published_at := v_release_at;
    new.editorial_metadata := coalesce(new.editorial_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'qa_mode','prepublication_2m',
        'qa_nonblocking',true,
        'qa_scheduled_at',v_requested_at,
        'qa_release_at',v_release_at,
        'qa_rule','release_at_is_hard_deadline_no_qa_gate',
        'qa_breaking',coalesce(new.is_breaking,false)
      );
    return new;
  end if;

  if v_existing_release is not null and new.status = 'published'::public.article_status then
    if new.publish_at is null or new.publish_at < v_existing_release then new.publish_at := v_existing_release; end if;
    if new.published_at is null or new.published_at < v_existing_release then new.published_at := v_existing_release; end if;
  end if;

  return new;
end;
$$;

create or replace function public.enqueue_article_qa_run()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_should_enqueue boolean := false;
begin
  if new.status = 'scheduled'::public.article_status then
    v_should_enqueue := tg_op = 'INSERT'
      or old.status is distinct from 'scheduled'::public.article_status
      or old.headline is distinct from new.headline
      or old.deck is distinct from new.deck
      or old.body_markdown is distinct from new.body_markdown
      or old.hero_url is distinct from new.hero_url
      or old.hero_media_id is distinct from new.hero_media_id
      or old.source_metadata is distinct from new.source_metadata;
  elsif new.status = 'published'::public.article_status then
    v_should_enqueue := tg_op = 'INSERT'
      or old.status is distinct from 'published'::public.article_status;
  end if;

  if v_should_enqueue then
    insert into public.article_qa_runs(article_id, status)
    values (new.id, 'pending')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_article_qa_run on public.articles;
create trigger trg_enqueue_article_qa_run
after insert or update of status, headline, deck, body_markdown, hero_url, hero_media_id, source_metadata
on public.articles
for each row execute function public.enqueue_article_qa_run();

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
begin
  for article in
    select a.id, a.status, a.publish_at, a.hero_media_id, a.hero_url, a.editorial_metadata
    from public.articles a
    where a.status = 'scheduled'::public.article_status
      and a.publish_at is not null
      and coalesce(
        case
          when nullif(a.editorial_metadata->>'qa_release_at','') is not null
            then (a.editorial_metadata->>'qa_release_at')::timestamptz
          else null
        end,
        a.publish_at
      ) <= v_now
    order by a.publish_at
    for update skip locked
  loop
    begin
      v_release_at := coalesce(
        nullif(article.editorial_metadata->>'qa_release_at','')::timestamptz,
        article.publish_at
      );
    exception when others then
      v_release_at := article.publish_at;
    end;

    if v_release_at is null or v_release_at > v_now then
      continue;
    end if;

    media_error := public.article_media_publication_error(article.hero_media_id, article.hero_url);

    if media_error is not null then
      insert into public.publication_watchdog_events(article_id, issue_type, reason, details)
      values (article.id, 'blocked', media_error,
        jsonb_build_object('source','publication_watchdog','publish_at',article.publish_at,'qa_release_at',v_release_at,'checked_at',v_now))
      on conflict (article_id, issue_type) where resolved_at is null and issue_type in ('blocked','publish_failed')
      do update set reason=excluded.reason, details=excluded.details, created_at=now();

      update public.articles
         set editorial_metadata = coalesce(editorial_metadata, '{}'::jsonb)
           || jsonb_build_object(
                'publication_watchdog',
                jsonb_build_object('state','blocked','reason',media_error,'checked_at',v_now,'qa_release_at',v_release_at)
              )
       where id = article.id;
      continue;
    end if;

    begin
      update public.articles
         set status = 'published'::public.article_status,
             publish_at = greatest(coalesce(publish_at, v_release_at), v_release_at),
             published_at = greatest(coalesce(published_at, v_now), v_release_at),
             editorial_metadata = coalesce(editorial_metadata, '{}'::jsonb)
               || jsonb_build_object(
                    'publication_watchdog',
                    jsonb_build_object('state','auto_released','checked_at',v_now,'qa_release_at',v_release_at)
                  )
       where id = article.id;

      insert into public.publication_watchdog_events(article_id, issue_type, reason, details, resolved_at)
      values (article.id, 'auto_released', null,
        jsonb_build_object('qa_release_at',v_release_at,'released_at',v_now), v_now);

      update public.publication_watchdog_events
         set resolved_at = coalesce(resolved_at, v_now)
       where article_id = article.id
         and resolved_at is null
         and issue_type in ('blocked','publish_failed');
    exception when others then
      insert into public.publication_watchdog_events(article_id, issue_type, reason, details)
      values (article.id, 'publish_failed', sqlstate,
        jsonb_build_object('source','publication_watchdog','message',sqlerrm,'publish_at',article.publish_at,'qa_release_at',v_release_at,'checked_at',v_now))
      on conflict (article_id, issue_type) where resolved_at is null and issue_type in ('blocked','publish_failed')
      do update set reason=excluded.reason, details=excluded.details, created_at=now();
    end;
  end loop;

  update public.publication_watchdog_events e
     set resolved_at = coalesce(e.resolved_at, v_now)
   where e.resolved_at is null
     and e.issue_type in ('blocked','publish_failed')
     and exists (
       select 1 from public.articles a
       where a.id = e.article_id
         and a.status = 'published'::public.article_status
     );
end;
$$;

create or replace function public.publish_article_safely(p_article_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  article public.articles%rowtype;
  media_error text;
  v_now timestamptz := clock_timestamp();
  v_requested_at timestamptz;
  v_release_at timestamptz;
begin
  select * into article
  from public.articles
  where id = p_article_id
  for update;

  if not found then raise exception 'article not found: %', p_article_id; end if;
  if article.status = 'published'::public.article_status then return article.id; end if;

  begin
    v_requested_at := nullif(article.editorial_metadata->>'publication_requested_at','')::timestamptz;
  exception when others then
    v_requested_at := null;
  end;
  v_requested_at := coalesce(v_requested_at, v_now);

  begin
    v_release_at := nullif(article.editorial_metadata->>'qa_release_at','')::timestamptz;
  exception when others then
    v_release_at := null;
  end;
  v_release_at := coalesce(v_release_at, greatest(coalesce(article.publish_at, v_requested_at), v_requested_at + interval '2 minutes'));

  media_error := public.article_media_publication_error(article.hero_media_id, article.hero_url);
  if media_error is not null then
    insert into public.publication_watchdog_events(article_id, issue_type, reason, details)
    values (article.id, 'blocked', media_error,
      jsonb_build_object('source','publish_article_safely','status',article.status,'publish_at',article.publish_at,'qa_release_at',v_release_at))
    on conflict (article_id, issue_type) where resolved_at is null and issue_type in ('blocked','publish_failed')
    do update set reason=excluded.reason, details=excluded.details, created_at=now();

    update public.articles
       set status = 'scheduled'::public.article_status,
           publish_at = v_release_at,
           published_at = null,
           editorial_metadata = coalesce(editorial_metadata, '{}'::jsonb)
             || jsonb_build_object('publication_requested_at',v_requested_at,'qa_release_at',v_release_at,'publication_path','safe_publish')
     where id = article.id;
    return article.id;
  end if;

  if v_now < v_release_at then
    update public.articles
       set status = 'scheduled'::public.article_status,
           publish_at = v_release_at,
           published_at = null,
           editorial_metadata = coalesce(editorial_metadata, '{}'::jsonb)
             || jsonb_build_object('publication_requested_at',v_requested_at,'qa_release_at',v_release_at,'publication_path','safe_publish')
     where id = article.id;
    return article.id;
  end if;

  update public.articles
     set status = 'published'::public.article_status,
         publish_at = v_release_at,
         published_at = v_now,
         editorial_metadata = coalesce(editorial_metadata, '{}'::jsonb)
           || jsonb_build_object('publication_requested_at',v_requested_at,'qa_release_at',v_release_at,'publication_path','safe_publish')
   where id = article.id;

  update public.publication_watchdog_events
     set resolved_at = coalesce(resolved_at, v_now)
   where article_id = article.id
     and resolved_at is null
     and issue_type in ('blocked','publish_failed');

  return article.id;
end;
$$;