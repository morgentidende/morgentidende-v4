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
       and regexp_replace(coalesce(old.body_markdown,''), '\s+', ' ', 'g')
           = regexp_replace(coalesce(new.body_markdown,''), '\s+', ' ', 'g') then
      v_material_change := false;
    end if;
  end if;

  if new.status = 'scheduled'::public.article_status then
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
