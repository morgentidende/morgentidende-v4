alter table public.article_qa_runs drop constraint if exists article_qa_runs_status_check;
alter table public.article_qa_runs add constraint article_qa_runs_status_check
  check (status in ('pending','running','passed','warnings','failed','superseded'));

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
  elsif new.status = 'published'::public.article_status
        and (tg_op = 'INSERT' or old.status is distinct from 'published'::public.article_status) then
    v_should_enqueue := true;
  end if;

  if not v_should_enqueue then return new; end if;

  v_hash := public.article_qa_content_hash(new.headline,new.deck,new.body_markdown,new.hero_media_id,new.hero_url,new.source_metadata);
  begin
    v_requested_at := nullif(new.editorial_metadata->>'publication_requested_at','')::timestamptz;
  exception when others then
    v_requested_at := null;
  end;

  if new.status = 'scheduled'::public.article_status then
    update public.article_qa_runs
       set status='superseded', finished_at=coalesce(finished_at,clock_timestamp()), updated_at=clock_timestamp(),
           warnings = coalesce(warnings,'[]'::jsonb) || jsonb_build_array('superseded_by_newer_article_version')
     where article_id=new.id and status='pending' and content_hash is distinct from v_hash;

    select count(*) into v_run_count
      from public.article_qa_runs q
     where q.article_id=new.id
       and q.status <> 'superseded'
       and (v_requested_at is null or q.created_at >= v_requested_at - interval '1 second');

    if v_run_count >= 4 and not exists (
      select 1 from public.article_qa_runs q
       where q.article_id=new.id and q.content_hash=v_hash and q.status in ('passed','warnings')
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
     where q.article_id=new.id and q.content_hash=v_hash and q.status in ('pending','running','passed','warnings')
  ) then
    insert into public.article_qa_runs(article_id,status,content_hash)
    values (new.id,'pending',v_hash);
  end if;
  return new;
end;
$$;

create or replace function public.article_current_qa_state(p_article_id uuid)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  a public.articles%rowtype;
  v_hash text;
  q public.article_qa_runs%rowtype;
  v_source jsonb;
  v_requested_at timestamptz;
  v_run_count int;
begin
  select * into a from public.articles where id=p_article_id;
  if not found then return jsonb_build_object('state','missing_article'); end if;
  v_hash := public.article_qa_content_hash(a.headline,a.deck,a.body_markdown,a.hero_media_id,a.hero_url,a.source_metadata);
  v_source := public.evaluate_article_source_quality(a.source_metadata,a.editorial_metadata);

  select * into q
    from public.article_qa_runs
   where article_id=a.id and content_hash=v_hash
   order by created_at desc limit 1;

  begin v_requested_at := nullif(a.editorial_metadata->>'publication_requested_at','')::timestamptz;
  exception when others then v_requested_at := null; end;
  select count(*) into v_run_count from public.article_qa_runs r
   where r.article_id=a.id and r.status <> 'superseded' and (v_requested_at is null or r.created_at >= v_requested_at - interval '1 second');

  return jsonb_build_object(
    'content_hash',v_hash,
    'qa_status',coalesce(q.status,'missing'),
    'qa_finished_at',q.finished_at,
    'qa_run_id',q.id,
    'source_quality',v_source,
    'run_count',v_run_count,
    'publishable',coalesce(q.status in ('passed','warnings'),false) and coalesce(v_source->>'gate','block') <> 'block'
  );
end;
$$;
