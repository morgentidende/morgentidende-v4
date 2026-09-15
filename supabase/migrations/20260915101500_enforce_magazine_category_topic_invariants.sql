-- Make Viden/Liv magazine identity and active magazine topic keys database invariants.
-- Existing legacy rows are not rewritten or unpublished.

create or replace function public.normalize_bridge_kind(
  p_kind text,
  p_category_slug text
)
returns public.article_kind
language plpgsql
immutable
set search_path = public
as $$
declare
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_category text := lower(trim(coalesce(p_category_slug, '')));
begin
  if v_category in ('viden', 'liv') then
    if v_kind = '' or v_kind in ('magazine', 'article', 'evergreen') then
      return 'magazine'::public.article_kind;
    end if;
    raise exception 'kind_category_conflict';
  end if;

  if v_kind = '' then
    return 'news'::public.article_kind;
  end if;

  if v_kind in ('news', 'comment', 'debate', 'magazine') then
    return v_kind::public.article_kind;
  end if;

  raise exception 'invalid_article_kind';
end;
$$;

create or replace function public.enforce_article_category_kind()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_category_slug text;
begin
  select lower(c.slug) into v_category_slug
  from public.categories c
  where c.id = new.category_id;

  if v_category_slug in ('viden', 'liv')
     and new.kind is distinct from 'magazine'::public.article_kind then
    raise exception 'kind_category_conflict';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_active_magazine_topic_key()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_admin boolean := current_setting('morgentidende.topic_key_admin', true) = '1';
begin
  if new.kind is distinct from 'magazine'::public.article_kind then
    return new;
  end if;

  if new.status in ('scheduled'::public.article_status, 'published'::public.article_status)
     and nullif(trim(new.topic_key), '') is null then
    raise exception 'magazine_topic_key_required';
  end if;

  if tg_op = 'UPDATE'
     and old.kind = 'magazine'::public.article_kind
     and old.status in ('scheduled'::public.article_status, 'published'::public.article_status)
     and new.kind = 'magazine'::public.article_kind
     and new.status in ('scheduled'::public.article_status, 'published'::public.article_status)
     and new.topic_key is distinct from old.topic_key
     and not v_admin then
    raise exception 'magazine_topic_key_immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_article_category_kind on public.articles;
create trigger trg_validate_article_category_kind
before insert or update of kind, category_id on public.articles
for each row execute function public.enforce_article_category_kind();

-- Trigger name intentionally sorts after trg_sync_article_topic_key so validation
-- sees the normalized/synchronised key when both fire in the same statement.
drop trigger if exists trg_validate_active_magazine_topic_key on public.articles;
create trigger trg_validate_active_magazine_topic_key
before insert or update of kind, status, topic_key, editorial_metadata on public.articles
for each row execute function public.enforce_active_magazine_topic_key();

create table if not exists public.article_topic_key_corrections (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  old_key text,
  new_key text not null,
  actor text not null,
  reason text not null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists article_topic_key_corrections_article_created_idx
  on public.article_topic_key_corrections(article_id, created_at desc);

create or replace function public.correct_article_topic_key(
  p_article_id uuid,
  p_new_key text,
  p_actor text,
  p_reason text
)
returns public.articles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_article public.articles%rowtype;
  v_new_key text;
begin
  v_new_key := nullif(public.normalize_story_key(p_new_key), '');
  if v_new_key is null then
    raise exception 'magazine_topic_key_required';
  end if;
  if length(trim(coalesce(p_actor, ''))) < 2 then
    raise exception 'topic_key_correction_requires_actor';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'topic_key_correction_requires_reason';
  end if;

  select * into v_article
  from public.articles
  where id = p_article_id
  for update;

  if not found then
    raise exception 'article_not_found';
  end if;
  if v_article.kind <> 'magazine'::public.article_kind then
    raise exception 'topic_key_correction_requires_magazine';
  end if;

  insert into public.article_topic_key_corrections(article_id, old_key, new_key, actor, reason)
  values (v_article.id, v_article.topic_key, v_new_key, trim(p_actor), trim(p_reason));

  perform set_config('morgentidende.topic_key_admin', '1', true);
  update public.articles
     set topic_key = v_new_key
   where id = v_article.id
  returning * into v_article;

  return v_article;
end;
$$;

revoke all on table public.article_topic_key_corrections from public;
revoke all on function public.correct_article_topic_key(uuid, text, text, text) from public;
grant execute on function public.correct_article_topic_key(uuid, text, text, text) to service_role;

create or replace function public.ingest_github_publish_payload(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue_id text;
  v_slug text;
  v_headline text;
  v_headline_key text;
  v_body text;
  v_category_slug text;
  v_kind public.article_kind;
  v_category_id uuid;
  v_article_id uuid;
  v_duplicate_id uuid;
  v_existing_queue text;
  v_publish_at timestamptz;
  v_source_metadata jsonb;
  v_editorial_metadata jsonb;
  v_story_cluster_id uuid;
  v_topic_key text;
  v_story_kind text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload_must_be_object';
  end if;

  v_queue_id := nullif(trim(p_payload->>'queue_id'), '');
  v_slug := nullif(trim(p_payload->>'slug'), '');
  v_headline := nullif(trim(p_payload->>'headline'), '');
  v_body := coalesce(p_payload->>'body_markdown', '');
  v_category_slug := nullif(lower(trim(p_payload->>'category_slug')), '');

  if v_queue_id is null then raise exception 'queue_id_required'; end if;
  if v_slug is null then raise exception 'slug_required'; end if;
  if v_headline is null then raise exception 'headline_required'; end if;
  if v_category_slug is null then raise exception 'category_slug_required'; end if;
  if char_length(v_slug) > 180 then raise exception 'slug_too_long'; end if;
  if char_length(v_headline) > 220 then raise exception 'headline_too_long'; end if;

  if coalesce(jsonb_typeof(p_payload->'source_metadata'), 'array') <> 'array' then
    raise exception 'source_metadata_must_be_array';
  end if;
  if coalesce(jsonb_typeof(p_payload->'editorial_metadata'), 'object') <> 'object' then
    raise exception 'editorial_metadata_must_be_object';
  end if;

  v_kind := public.normalize_bridge_kind(p_payload->>'kind', v_category_slug);

  select id into v_category_id
  from public.categories
  where lower(slug) = v_category_slug and active = true
  limit 1;
  if v_category_id is null then raise exception 'unknown_category:%', v_category_slug; end if;

  if nullif(p_payload->>'story_cluster_id','') is not null then
    begin
      v_story_cluster_id := (p_payload->>'story_cluster_id')::uuid;
    exception when others then
      raise exception 'invalid_story_cluster_id';
    end;
  end if;

  begin
    v_publish_at := coalesce(nullif(p_payload->>'publish_at','')::timestamptz, clock_timestamp());
  exception when others then
    raise exception 'invalid_publish_at';
  end;

  v_source_metadata := coalesce(p_payload->'source_metadata', '[]'::jsonb);
  v_editorial_metadata := coalesce(p_payload->'editorial_metadata', '{}'::jsonb)
    || jsonb_build_object(
      'github_queue_id', v_queue_id,
      'publication_transport', 'github_pr_bridge',
      'publication_requested_at', clock_timestamp()
    );

  -- Preserve idempotent retries for already-created transport jobs, including legacy rows.
  select id, editorial_metadata->>'github_queue_id'
    into v_article_id, v_existing_queue
  from public.articles
  where slug = v_slug
  limit 1;

  if v_article_id is not null then
    if v_existing_queue = v_queue_id then
      perform public.publish_article_safely(v_article_id);
      return v_article_id;
    end if;
    raise exception 'slug_conflict:%', v_slug;
  end if;

  select id into v_article_id
  from public.articles
  where editorial_metadata->>'github_queue_id' = v_queue_id
  order by created_at desc
  limit 1;

  if v_article_id is not null then
    perform public.publish_article_safely(v_article_id);
    return v_article_id;
  end if;

  v_headline_key := public.normalize_story_key(v_headline);
  v_topic_key := nullif(public.normalize_story_key(v_editorial_metadata->>'topic_key'), '');
  v_story_kind := coalesce(
    nullif(v_editorial_metadata->>'story_kind',''),
    case when v_kind = 'magazine'::public.article_kind then 'evergreen_explainer' else 'news' end
  );

  if v_kind = 'magazine'::public.article_kind then
    if v_topic_key is null then
      raise exception 'magazine_topic_key_required';
    end if;
    if v_story_kind not in ('evergreen_explainer', 'followup', 'new_study', 'update') then
      raise exception 'magazine_story_kind_invalid';
    end if;
    v_editorial_metadata := jsonb_set(v_editorial_metadata, '{topic_key}', to_jsonb(v_topic_key), true);
    v_editorial_metadata := jsonb_set(v_editorial_metadata, '{story_kind}', to_jsonb(v_story_kind), true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('headline:' || v_headline_key, 0));
  if v_kind = 'magazine'::public.article_kind then
    perform pg_advisory_xact_lock(hashtextextended('topic:' || v_topic_key, 0));
  end if;

  select a.id into v_duplicate_id
  from public.articles a
  where a.status in ('published'::public.article_status, 'scheduled'::public.article_status)
    and coalesce(a.published_at, a.publish_at, a.created_at) >= clock_timestamp() - interval '7 days'
    and public.normalize_story_key(a.headline) = v_headline_key
  order by coalesce(a.published_at, a.publish_at, a.created_at) desc
  limit 1;

  if v_duplicate_id is not null then
    raise exception 'duplicate_7d_exact:%', v_duplicate_id;
  end if;

  if v_kind = 'magazine'::public.article_kind and v_story_kind <> 'followup' then
    select a.id into v_duplicate_id
    from public.articles a
    where a.status in ('published'::public.article_status, 'scheduled'::public.article_status)
      and coalesce(a.published_at, a.publish_at, a.created_at) >= clock_timestamp() - interval '7 days'
      and a.topic_key = v_topic_key
    order by coalesce(a.published_at, a.publish_at, a.created_at) desc
    limit 1;

    if v_duplicate_id is not null then
      raise exception 'duplicate_7d_topic:%', v_duplicate_id;
    end if;
  end if;

  insert into public.articles (
    slug, kind, status, category_id, story_cluster_id,
    headline, frontpage_headline, headline_accent_text, deck, body_markdown,
    author_name, author_title,
    hero_url, hero_alt, hero_source_url, hero_candidate_url, hero_candidate_note,
    hero_credit, hero_license, hero_license_url,
    is_lead, lead_rank, is_breaking, breaking_until,
    publish_at, created_by, source_metadata, editorial_metadata, topic_key
  ) values (
    v_slug, v_kind, 'scheduled'::public.article_status, v_category_id, v_story_cluster_id,
    v_headline, nullif(p_payload->>'frontpage_headline',''), nullif(p_payload->>'headline_accent_text',''),
    nullif(p_payload->>'deck',''), v_body,
    nullif(p_payload->>'author_name',''), nullif(p_payload->>'author_title',''),
    nullif(p_payload->>'hero_url',''), nullif(p_payload->>'hero_alt',''), nullif(p_payload->>'hero_source_url',''),
    nullif(p_payload->>'hero_candidate_url',''), nullif(p_payload->>'hero_candidate_note',''),
    nullif(p_payload->>'hero_credit',''), nullif(p_payload->>'hero_license',''), nullif(p_payload->>'hero_license_url',''),
    coalesce((p_payload->>'is_lead')::boolean, false), nullif(p_payload->>'lead_rank','')::integer,
    coalesce((p_payload->>'is_breaking')::boolean, false), nullif(p_payload->>'breaking_until','')::timestamptz,
    v_publish_at, 'chatgpt_scheduled_github_bridge', v_source_metadata, v_editorial_metadata, v_topic_key
  )
  returning id into v_article_id;

  perform public.publish_article_safely(v_article_id);
  return v_article_id;
end;
$$;
