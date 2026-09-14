alter table public.article_qa_runs
  add column if not exists content_hash text,
  add column if not exists source_quality jsonb not null default '{}'::jsonb;

drop index if exists public.article_qa_runs_one_pending_idx;
create unique index if not exists article_qa_runs_one_active_hash_idx
  on public.article_qa_runs(article_id, content_hash)
  where status in ('pending','running') and content_hash is not null;
create index if not exists article_qa_runs_article_hash_finished_idx
  on public.article_qa_runs(article_id, content_hash, finished_at desc)
  where content_hash is not null;

create or replace function public.article_qa_content_hash(
  p_headline text,
  p_deck text,
  p_body_markdown text,
  p_hero_media_id uuid,
  p_hero_url text,
  p_source_metadata jsonb
)
returns text
language sql
immutable
set search_path = public
as $$
  select md5(
    coalesce(p_headline,'') || E'\x1f' ||
    coalesce(p_deck,'') || E'\x1f' ||
    coalesce(p_body_markdown,'') || E'\x1f' ||
    coalesce(p_hero_media_id::text,'') || E'\x1f' ||
    coalesce(p_hero_url,'') || E'\x1f' ||
    coalesce(p_source_metadata,'[]'::jsonb)::text
  );
$$;

create or replace function public.article_current_qa_hash(p_article_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select public.article_qa_content_hash(
    a.headline, a.deck, a.body_markdown, a.hero_media_id, a.hero_url, a.source_metadata
  )
  from public.articles a
  where a.id = p_article_id;
$$;

create or replace function public.classify_editorial_source(p_source jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_explicit text := lower(coalesce(p_source->>'source_type', p_source->>'quality_tier', ''));
  v_publisher text := lower(coalesce(p_source->>'publisher',''));
  v_url text := lower(coalesce(p_source->>'url',''));
  v_host text;
begin
  if v_explicit in ('primary_official','official','authority','government','court','police','statistics') then return 'primary_official'; end if;
  if v_explicit in ('primary_original','original_post','social_post','original_document','subject_statement') then return 'primary_original'; end if;
  if v_explicit in ('strong_secondary','major_media','wire_service') then return 'strong_secondary'; end if;
  if v_explicit in ('niche','advocacy','activist','tip_source') then return v_explicit; end if;
  if v_explicit in ('reference','image','media_reference') then return 'reference'; end if;

  v_host := regexp_replace(v_url, '^https?://([^/]+).*$', '\1');
  v_host := regexp_replace(v_host, '^www\.', '');

  if v_host ~ '(commons\.wikimedia\.org|wikipedia\.org)$' then return 'reference'; end if;
  if v_host ~ '(samnytt\.se|jihadwatch\.org)$' then return 'niche'; end if;
  if v_publisher ~ '(free speech union|big brother watch|amnesty|human rights watch|greenpeace|think tank|institute|foundation|campaign)' then return 'advocacy'; end if;

  if v_host ~ '(^|\.)(gov\.[a-z.]+|government\.[a-z.]+|parliament\.[a-z.]+|police\.[a-z.]+|court\.[a-z.]+)$'
     or v_host ~ '(^|\.)(gov\.uk|ft\.dk|bundestag\.de|europa\.eu|ec\.europa\.eu|echr\.coe\.int|justice\.gov|treasury\.gov|judiciary\.uk|cps\.gov\.uk|spa\.gov\.sa)$'
     or v_publisher ~ '(ministry|ministeriet|ministerium|department of|government|regering|parliament|folketing|bundestag|court|domstol|judiciary|police|politi|prosecution|statsadvokat|statistics|statistik|election authority|valgkommission|electoral commission|treasury|central bank|commission|kommune|council|inspectorate|embassy|prime minister|president|white house|europ[æe]an court|european court|sikkerhedspolisen|mi5|fbi|cia|pet\b)' then
    return 'primary_official';
  end if;

  if v_host ~ '(^|\.)(facebook\.com|x\.com|twitter\.com|instagram\.com|youtube\.com|tiktok\.com)$' then
    return 'primary_original';
  end if;

  if v_host ~ '(^|\.)(reuters\.com|apnews\.com|afp\.com|bbc\.com|bbc\.co\.uk|dr\.dk|tv2\.dk|svt\.se|nrk\.no|zdf\.de|tagesschau\.de|orf\.at|elpais\.com|lemonde\.fr|theguardian\.com|nytimes\.com|washingtonpost\.com|wsj\.com|ft\.com|handelsblatt\.com|zeit\.de|nos\.nl|lbc\.co\.uk)$'
     or v_publisher ~ '^(reuters|associated press|ap|afp|bbc|dr|tv 2|svt|nrk|zdf|tagesschau|orf|el pa[ií]s|le monde|financial times|wall street journal|new york times|washington post|handelsblatt|die zeit|nos|lbc)$' then
    return 'strong_secondary';
  end if;

  if v_publisher ~ '(press agency|news agency|nyhedsbureau)' then return 'strong_secondary'; end if;

  return 'other_secondary';
end;
$$;

create or replace function public.evaluate_article_source_quality(
  p_source_metadata jsonb,
  p_editorial_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  s jsonb;
  v_class text;
  v_primary_official int := 0;
  v_primary_original int := 0;
  v_strong_secondary int := 0;
  v_other_secondary int := 0;
  v_niche int := 0;
  v_advocacy int := 0;
  v_reference int := 0;
  v_total_evidence int := 0;
  v_subject_original boolean := false;
  v_exception_type text := lower(coalesce(p_editorial_metadata #>> '{source_quality_exception,type}',''));
  v_exception_reason text := coalesce(p_editorial_metadata #>> '{source_quality_exception,reason}','');
  v_gate text;
  v_reason text;
begin
  if jsonb_typeof(p_source_metadata) <> 'array' then
    return jsonb_build_object('gate','block','reason','source_metadata_not_array','counts',jsonb_build_object());
  end if;

  for s in select value from jsonb_array_elements(p_source_metadata)
  loop
    v_class := public.classify_editorial_source(s);
    case v_class
      when 'primary_official' then v_primary_official := v_primary_official + 1;
      when 'primary_original' then
        v_primary_original := v_primary_original + 1;
        if coalesce((s->>'subject_is_source')::boolean,false) then v_subject_original := true; end if;
      when 'strong_secondary' then v_strong_secondary := v_strong_secondary + 1;
      when 'niche' then v_niche := v_niche + 1;
      when 'advocacy' then v_advocacy := v_advocacy + 1;
      when 'reference' then v_reference := v_reference + 1;
      else v_other_secondary := v_other_secondary + 1;
    end case;
  end loop;

  v_total_evidence := v_primary_official + v_primary_original + v_strong_secondary + v_other_secondary + v_niche + v_advocacy;

  if v_total_evidence = 0 then
    v_gate := 'block'; v_reason := 'no_editorial_evidence_sources';
  elsif (v_subject_original or (v_exception_type in ('original_post_is_subject','original_document_is_subject','primary_statement_is_subject') and btrim(v_exception_reason) <> ''))
        and v_primary_original > 0 then
    v_gate := 'pass'; v_reason := 'direct_subject_primary_source_exception';
  elsif v_primary_official > 0 and v_strong_secondary > 0 then
    v_gate := 'pass'; v_reason := 'primary_plus_strong_secondary';
  elsif v_primary_official > 0 then
    v_gate := 'pass'; v_reason := 'primary_official_present';
  elsif v_strong_secondary >= 2 then
    v_gate := 'pass'; v_reason := 'multiple_strong_secondary_sources';
  elsif v_strong_secondary = 1 then
    v_gate := 'warn'; v_reason := 'single_strong_secondary_no_primary';
  else
    v_gate := 'block';
    if v_niche > 0 and v_primary_official = 0 and v_strong_secondary = 0 then
      v_reason := 'niche_source_without_independent_documentation';
    elsif v_advocacy > 0 and v_primary_official = 0 and v_strong_secondary = 0 then
      v_reason := 'advocacy_source_without_independent_documentation';
    elsif v_primary_original > 0 then
      v_reason := 'original_source_requires_subject_exception_or_independent_documentation';
    else
      v_reason := 'insufficient_source_quality';
    end if;
  end if;

  return jsonb_build_object(
    'gate',v_gate,
    'reason',v_reason,
    'counts',jsonb_build_object(
      'primary_official',v_primary_official,
      'primary_original',v_primary_original,
      'strong_secondary',v_strong_secondary,
      'other_secondary',v_other_secondary,
      'niche',v_niche,
      'advocacy',v_advocacy,
      'reference',v_reference
    )
  );
end;
$$;

create or replace function public.prepare_article_qa_run()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  a public.articles%rowtype;
begin
  select * into a from public.articles where id = new.article_id;
  if not found then return new; end if;
  new.content_hash := coalesce(new.content_hash, public.article_qa_content_hash(a.headline,a.deck,a.body_markdown,a.hero_media_id,a.hero_url,a.source_metadata));
  new.source_quality := public.evaluate_article_source_quality(a.source_metadata,a.editorial_metadata);
  return new;
end;
$$;

drop trigger if exists trg_prepare_article_qa_run on public.article_qa_runs;
create trigger trg_prepare_article_qa_run
before insert on public.article_qa_runs
for each row execute function public.prepare_article_qa_run();

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
       and (v_requested_at is null or q.created_at >= v_requested_at);

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
   where r.article_id=a.id and r.status <> 'superseded' and (v_requested_at is null or r.created_at >= v_requested_at);

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
  v_qa_state jsonb;
  v_block_reason text;
begin
  select * into article from public.articles where id=p_article_id for update;
  if not found then raise exception 'article not found: %',p_article_id; end if;
  if article.status='published'::public.article_status then return article.id; end if;

  begin v_requested_at := nullif(article.editorial_metadata->>'publication_requested_at','')::timestamptz;
  exception when others then v_requested_at := null; end;
  v_requested_at := coalesce(v_requested_at,v_now);
  v_release_at := public.article_qa_release_at(article.editorial_metadata,article.publish_at);
  v_release_at := coalesce(v_release_at,greatest(coalesce(article.publish_at,v_requested_at),v_requested_at+interval '2 minutes'));
  media_error := public.article_media_publication_error(article.hero_media_id,article.hero_url);
  v_qa_state := public.article_current_qa_state(article.id);

  if coalesce(v_qa_state #>> '{source_quality,gate}','block')='block' then
    v_block_reason := 'source_quality:' || coalesce(v_qa_state #>> '{source_quality,reason}','insufficient');
  elsif coalesce(v_qa_state->>'qa_status','missing') not in ('passed','warnings') then
    v_block_reason := case when coalesce((v_qa_state->>'run_count')::int,0)>=4 then 'qa_unstable_version' else 'qa_not_complete_for_current_version' end;
  elsif media_error is not null then
    v_block_reason := media_error;
  end if;

  if v_block_reason is not null then
    insert into public.publication_watchdog_events(article_id,issue_type,reason,details)
    values(article.id,'blocked',v_block_reason,jsonb_build_object('source','publish_article_safely','qa_state',v_qa_state,'publish_at',article.publish_at,'qa_release_at',v_release_at))
    on conflict (article_id,issue_type) where resolved_at is null and issue_type in ('blocked','publish_failed')
    do update set reason=excluded.reason,details=excluded.details;
  end if;

  if v_block_reason is not null or v_now < v_release_at then
    update public.articles set status='scheduled'::public.article_status,publish_at=v_release_at,published_at=null,
      editorial_metadata=coalesce(editorial_metadata,'{}'::jsonb)||jsonb_build_object('publication_requested_at',v_requested_at,'qa_release_at',v_release_at,'publication_path','safe_publish')
    where id=article.id;
    return article.id;
  end if;

  update public.articles set status='published'::public.article_status,publish_at=v_release_at,published_at=v_now,
    editorial_metadata=coalesce(editorial_metadata,'{}'::jsonb)||jsonb_build_object('publication_requested_at',v_requested_at,'qa_release_at',v_release_at,'publication_path','safe_publish','qa_published_hash',v_qa_state->>'content_hash','source_quality_at_publish',v_qa_state->'source_quality')
  where id=article.id;

  update public.publication_watchdog_events set resolved_at=coalesce(resolved_at,v_now)
  where article_id=article.id and resolved_at is null and issue_type in ('blocked','publish_failed');
  return article.id;
end;
$$;

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
      values(article.id,'blocked',v_block_reason,jsonb_build_object('source','publication_watchdog','publish_at',article.publish_at,'qa_release_at',v_release_at,'checked_at',v_now,'qa_state',v_qa_state))
      on conflict (article_id,issue_type) where resolved_at is null and issue_type in ('blocked','publish_failed')
      do update set reason=excluded.reason,details=excluded.details;
      update public.articles set editorial_metadata=coalesce(editorial_metadata,'{}'::jsonb)||jsonb_build_object('publication_watchdog',jsonb_build_object('state','blocked','reason',v_block_reason,'checked_at',v_now,'qa_release_at',v_release_at,'qa_state',v_qa_state)) where id=article.id;
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
      on conflict (article_id,issue_type) where resolved_at is null and issue_type in ('blocked','publish_failed')
      do update set reason=excluded.reason,details=excluded.details;
    end;
  end loop;

  update public.publication_watchdog_events e set resolved_at=coalesce(e.resolved_at,v_now)
  where e.resolved_at is null and e.issue_type in ('blocked','publish_failed')
    and exists(select 1 from public.articles a where a.id=e.article_id and a.status='published'::public.article_status);
end;
$$;

revoke all on function public.article_current_qa_state(uuid) from public,anon,authenticated;
grant execute on function public.article_current_qa_state(uuid) to service_role;
