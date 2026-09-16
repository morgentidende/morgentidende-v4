-- QA is only enqueued once a scheduled article has publication-ready hero media.
create or replace function public.enqueue_article_qa_run()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_should_enqueue boolean := false;
  v_hash text;
  v_requested_at timestamptz;
  v_run_count integer := 0;
  v_material_change boolean := false;
  v_fixing_job text := nullif(current_setting('morgentidende.qa_fixing_job', true), '');
  v_inserted boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_material_change :=
         old.headline is distinct from new.headline
      or old.deck is distinct from new.deck
      or old.body_markdown is distinct from new.body_markdown
      or old.hero_url is distinct from new.hero_url
      or old.hero_media_id is distinct from new.hero_media_id
      or old.source_metadata is distinct from new.source_metadata;

    if v_material_change
       and old.headline is not distinct from new.headline
       and old.deck is not distinct from new.deck
       and old.hero_url is not distinct from new.hero_url
       and old.hero_media_id is not distinct from new.hero_media_id
       and old.source_metadata is not distinct from new.source_metadata
       and regexp_replace(coalesce(old.body_markdown,''), '\\s+', ' ', 'g')
           = regexp_replace(coalesce(new.body_markdown,''), '\\s+', ' ', 'g') then
      v_material_change := false;
    end if;
  end if;

  if new.status = 'scheduled'::public.article_status then
    if public.article_media_publication_error(new.hero_media_id, new.hero_url) is not null then
      return new;
    end if;

    v_should_enqueue := tg_op = 'INSERT'
      or old.status is distinct from 'scheduled'::public.article_status
      or v_material_change;
  elsif new.status = 'published'::public.article_status then
    v_should_enqueue := tg_op = 'INSERT'
      or old.status is distinct from 'published'::public.article_status
      or v_material_change;
  end if;

  if not v_should_enqueue then
    return new;
  end if;

  v_hash := public.article_qa_content_hash(
    new.headline,
    new.deck,
    new.body_markdown,
    new.hero_media_id,
    new.hero_url,
    new.source_metadata
  );

  perform public.supersede_stale_qa_runs(
    new.id,
    v_hash,
    case when v_fixing_job is null then null else v_fixing_job::uuid end
  );

  if v_fixing_job is not null then
    return new;
  end if;

  begin
    v_requested_at := nullif(new.editorial_metadata->>'publication_requested_at','')::timestamptz;
  exception when others then
    v_requested_at := null;
  end;

  if new.status = 'scheduled'::public.article_status then
    select count(*) into v_run_count
    from public.article_qa_runs q
    where q.article_id = new.id
      and q.status <> 'superseded'
      and (v_requested_at is null or q.created_at >= v_requested_at - interval '1 second');

    if v_run_count >= 4 and not exists (
      select 1
      from public.article_qa_runs q
      where q.article_id = new.id
        and q.content_hash = v_hash
        and q.status in ('passed', 'warnings')
    ) then
      update public.articles
         set editorial_metadata = coalesce(editorial_metadata, '{}'::jsonb)
           || jsonb_build_object(
                'qa_stability',
                jsonb_build_object(
                  'state', 'attention_required',
                  'reason', 'too_many_prepublication_versions',
                  'checked_at', clock_timestamp()
                )
              )
       where id = new.id;
      return new;
    end if;
  end if;

  if not exists (
    select 1
    from public.article_qa_runs q
    where q.article_id = new.id
      and q.content_hash = v_hash
      and q.status in ('pending', 'running', 'passed', 'warnings')
  ) then
    insert into public.article_qa_runs(article_id, status, content_hash)
    values (new.id, 'pending', v_hash);
    v_inserted := true;
  end if;

  if v_inserted then
    perform public.request_article_qa_runner();
  end if;

  return new;
end;
$function$;

create or replace function public.release_qa_approved_articles(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_count integer := 0;
  v_now timestamptz := clock_timestamp();
begin
  for r in
    select a.id
    from public.articles a
    where a.status = 'scheduled'::public.article_status
      and public.article_qa_release_at(a.editorial_metadata, a.publish_at) is not null
      and public.article_qa_release_at(a.editorial_metadata, a.publish_at) <= v_now
      and public.article_media_publication_error(a.hero_media_id, a.hero_url) is null
      and coalesce((public.article_current_qa_state(a.id)->>'publishable')::boolean, false)
    order by a.publish_at, a.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  loop
    perform public.publish_article_safely(r.id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

do $do$
declare
  j record;
begin
  for j in select jobid from cron.job where jobname = 'publication-watchdog' loop
    perform cron.unschedule(j.jobid);
  end loop;
end
$do$;

drop function if exists public.run_publication_watchdog();

select cron.alter_job(
  job_id := 1,
  command := $cmd$
    select net.http_post(
      url := 'https://lfttxjxfggjcxmdfjndk.supabase.co/functions/v1/article-qa',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='article_qa_anon_jwt' limit 1)
      ),
      body := '{}'::jsonb
    );
    select public.release_qa_approved_articles();
  $cmd$
);

update public.article_qa_runs q
set status = 'superseded',
    finished_at = coalesce(q.finished_at, clock_timestamp()),
    updated_at = clock_timestamp(),
    warnings = coalesce(q.warnings, '[]'::jsonb) || jsonb_build_array('superseded_by_hero_before_qa_migration')
from public.articles a
where q.article_id = a.id
  and a.status = 'scheduled'::public.article_status
  and public.article_media_publication_error(a.hero_media_id, a.hero_url) is null
  and q.content_hash is distinct from public.article_qa_content_hash(a.headline,a.deck,a.body_markdown,a.hero_media_id,a.hero_url,a.source_metadata)
  and q.status in ('pending','running');

insert into public.article_qa_runs(article_id, status, content_hash)
select a.id,
       'pending',
       public.article_qa_content_hash(a.headline,a.deck,a.body_markdown,a.hero_media_id,a.hero_url,a.source_metadata)
from public.articles a
where a.status = 'scheduled'::public.article_status
  and public.article_media_publication_error(a.hero_media_id, a.hero_url) is null
  and not exists (
    select 1
    from public.article_qa_runs q
    where q.article_id = a.id
      and q.content_hash = public.article_qa_content_hash(a.headline,a.deck,a.body_markdown,a.hero_media_id,a.hero_url,a.source_metadata)
      and q.status in ('pending','running','passed','warnings')
  );
