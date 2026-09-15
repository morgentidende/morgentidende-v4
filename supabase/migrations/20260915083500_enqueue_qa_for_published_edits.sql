-- Re-run QA when material content on an already-published article changes.
-- Keep the article live; the QA run is tied to the exact new content hash.

create or replace function public.enqueue_article_qa_run()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_should_enqueue boolean := false;
  v_hash text;
  v_requested_at timestamptz;
  v_run_count int := 0;
  v_material_change boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_material_change :=
         old.headline is distinct from new.headline
      or old.deck is distinct from new.deck
      or old.body_markdown is distinct from new.body_markdown
      or old.hero_url is distinct from new.hero_url
      or old.hero_media_id is distinct from new.hero_media_id
      or old.source_metadata is distinct from new.source_metadata;

    -- Ignore body-only whitespace normalization.
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

  if not v_should_enqueue then return new; end if;

  v_hash := public.article_qa_content_hash(
    new.headline,
    new.deck,
    new.body_markdown,
    new.hero_media_id,
    new.hero_url,
    new.source_metadata
  );

  begin
    v_requested_at := nullif(new.editorial_metadata->>'publication_requested_at','')::timestamptz;
  exception when others then
    v_requested_at := null;
  end;

  update public.article_qa_runs
     set status='superseded',
         finished_at=coalesce(finished_at,clock_timestamp()),
         updated_at=clock_timestamp(),
         warnings=coalesce(warnings,'[]'::jsonb) || jsonb_build_array('superseded_by_newer_article_version')
   where article_id=new.id
     and status='pending'
     and content_hash is distinct from v_hash;

  if new.status = 'scheduled'::public.article_status then
    select count(*) into v_run_count
      from public.article_qa_runs q
     where q.article_id=new.id
       and q.status <> 'superseded'
       and (v_requested_at is null or q.created_at >= v_requested_at - interval '1 second');

    if v_run_count >= 4 and not exists (
      select 1 from public.article_qa_runs q
       where q.article_id=new.id
         and q.content_hash=v_hash
         and q.status in ('passed','warnings')
    ) then
      update public.articles
         set editorial_metadata=coalesce(editorial_metadata,'{}'::jsonb)
           || jsonb_build_object('qa_stability',jsonb_build_object('state','attention_required','reason','too_many_prepublication_versions','checked_at',clock_timestamp()))
       where id=new.id;
      return new;
    end if;
  end if;

  if not exists (
    select 1 from public.article_qa_runs q
     where q.article_id=new.id
       and q.content_hash=v_hash
       and q.status in ('pending','running','passed','warnings')
  ) then
    insert into public.article_qa_runs(article_id,status,content_hash)
    values (new.id,'pending',v_hash);
  end if;

  return new;
end;
$$;
