-- Consolidate publication-state mutation and publication-write validation.
-- Keep the emergency autopublish kill switch and async QA enqueue separate.
--
-- Explicit BEFORE trigger order after this migration:
--   normalize source metadata (legacy name, alphabetically before trg_*)
--   trg_00_normalize_article_markdown
--   trg_10_apply_article_editorial_contract
--   trg_20_normalize_article_publication_state
--   trg_30_enforce_article_publication_contract
--   trg_90_snapshot_article_editorial_version

create or replace function public.normalize_article_publication_state()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_requested_at timestamptz;
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

  -- Canonical release metadata. There is no synthetic delay: an intentional
  -- future publish_at is respected; otherwise release eligibility is immediate.
  if v_entering_scheduled then
    begin
      v_requested_at := nullif(new.editorial_metadata->>'publication_requested_at','')::timestamptz;
    exception when others then
      v_requested_at := null;
    end;

    v_requested_at := coalesce(v_requested_at, v_now);
    v_release_at := public.article_qa_target_release_at(
      new.editorial_metadata - 'qa_release_at',
      new.publish_at,
      v_requested_at
    );

    new.publish_at := v_release_at;
    new.published_at := null;
    new.editorial_metadata := coalesce(new.editorial_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'qa_mode','current_version_prepublication',
        'qa_nonblocking',false,
        'qa_scheduled_at',v_requested_at,
        'qa_release_at',v_release_at,
        'qa_rule','current_version_qa_source_media_gate_before_release',
        'qa_breaking',coalesce(new.is_breaking,false)
      );
  elsif v_entering_published then
    if v_existing_release is not null then
      new.publish_at := greatest(coalesce(new.publish_at, v_existing_release), v_existing_release);
      new.published_at := greatest(coalesce(new.published_at, v_existing_release), v_existing_release);
    else
      begin
        v_requested_at := nullif(new.editorial_metadata->>'publication_requested_at','')::timestamptz;
      exception when others then
        v_requested_at := null;
      end;

      v_requested_at := coalesce(v_requested_at, v_now);
      v_release_at := public.article_qa_target_release_at(
        new.editorial_metadata - 'qa_release_at',
        new.publish_at,
        v_requested_at
      );

      new.publish_at := v_release_at;
      new.published_at := v_release_at;
      new.editorial_metadata := coalesce(new.editorial_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'qa_mode','current_version_prepublication',
          'qa_nonblocking',false,
          'qa_scheduled_at',v_requested_at,
          'qa_release_at',v_release_at,
          'qa_rule','current_version_qa_source_media_gate_before_release',
          'qa_breaking',coalesce(new.is_breaking,false)
        );
    end if;
  elsif v_existing_release is not null and new.status = 'published'::public.article_status then
    if new.publish_at is null or new.publish_at < v_existing_release then
      new.publish_at := v_existing_release;
    end if;
    if new.published_at is null or new.published_at < v_existing_release then
      new.published_at := v_existing_release;
    end if;
  end if;

  -- Canonical status/timestamp state.
  if new.status = 'published'::public.article_status then
    new.published_at := coalesce(new.published_at, v_now);
    new.first_published_at := coalesce(
      case when tg_op = 'UPDATE' then old.first_published_at else null end,
      new.first_published_at,
      new.published_at
    );
    new.unpublished_at := null;
  else
    if tg_op = 'UPDATE'
       and old.status = 'published'::public.article_status
       and new.status is distinct from old.status then
      new.unpublished_at := coalesce(new.unpublished_at, v_now);
    end if;
    new.published_at := null;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_article_publication_contract()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_error text;
begin
  -- A scheduled article may replace its archived hero, but may not silently
  -- detach it and continue pretending to be publication-ready.
  if tg_op = 'UPDATE'
     and new.status = 'scheduled'::public.article_status
     and old.hero_media_id is not null
     and new.hero_media_id is null then
    raise exception 'scheduled article hero cannot be detached; replace it with another archived media asset instead';
  end if;

  if new.status <> 'published'::public.article_status then
    return new;
  end if;

  -- Direct published inserts bypass the canonical scheduled -> media -> QA ->
  -- Safe Publish path and are therefore forbidden.
  if tg_op = 'INSERT' then
    raise exception 'publish_blocked: direct_published_insert_not_allowed';
  end if;

  -- Entering published must satisfy the complete current-version publication
  -- contract (QA, source quality, structured fields, media and follow-up rules).
  if old.status is distinct from 'published'::public.article_status then
    v_error := public.article_publication_transition_error_locked(
      new.id,
      new.headline,
      new.deck,
      new.body_markdown,
      new.hero_media_id,
      new.hero_url,
      new.source_metadata,
      new.editorial_metadata,
      new.kind,
      new.story_cluster_id,
      new.topic_key,
      true
    );

    if v_error is not null then
      raise exception 'publish_blocked: %', v_error;
    end if;
  else
    -- Existing published rows still need fail-closed media validation when the
    -- hero changes. Preserve the explicit legacy exception for old published
    -- rows that never had managed hero media and remain unchanged in that state.
    if not (old.hero_media_id is null and new.hero_media_id is null) then
      v_error := public.article_media_publication_error(new.hero_media_id, new.hero_url);
      perform public.raise_article_media_publication_error(v_error);
    end if;
  end if;

  -- Published articles within the same story cluster must use distinct heroes.
  if new.story_cluster_id is not null
     and new.hero_media_id is not null
     and exists (
       select 1
       from public.articles other
       where other.id <> new.id
         and other.status = 'published'::public.article_status
         and other.story_cluster_id = new.story_cluster_id
         and other.hero_media_id = new.hero_media_id
     ) then
    raise exception 'published articles in the same story cluster must use distinct hero media';
  end if;

  return new;
end;
$$;

-- Replace the two publication-state mutators with one canonical state normalizer.
drop trigger if exists trg_apply_prepublication_qa_buffer on public.articles;
drop trigger if exists trg_normalize_article_publication_state on public.articles;
drop function if exists public.apply_prepublication_qa_buffer();

create trigger trg_20_normalize_article_publication_state
before insert or update of
  status,
  publish_at,
  published_at,
  first_published_at,
  unpublished_at,
  is_breaking
on public.articles
for each row
execute function public.normalize_article_publication_state();

-- Replace three overlapping publication validators with one contract owner.
drop trigger if exists articles_validate_media_before_write on public.articles;
drop trigger if exists trg_enforce_publish_qa_invariants on public.articles;
drop trigger if exists trg_prevent_duplicate_cluster_hero on public.articles;

drop function if exists public.validate_article_media();
drop function if exists public.enforce_publish_qa_invariants();
drop function if exists public.prevent_duplicate_cluster_hero();

create trigger trg_30_enforce_article_publication_contract
before insert or update of
  status,
  hero_media_id,
  hero_url,
  story_cluster_id
on public.articles
for each row
execute function public.enforce_article_publication_contract();

-- Make the remaining critical BEFORE ordering legible by name.
drop trigger if exists trg_normalize_article_markdown_on_write on public.articles;
create trigger trg_00_normalize_article_markdown
before insert or update of body_markdown
on public.articles
for each row
execute function public.normalize_article_markdown_on_write();

drop trigger if exists trg_00_apply_article_editorial_contract on public.articles;
create trigger trg_10_apply_article_editorial_contract
before insert or update of
  topic_key,
  editorial_metadata,
  kind,
  category_id,
  status,
  story_cluster_id
on public.articles
for each row
execute function public.apply_article_editorial_contract();

drop trigger if exists trg_zz_snapshot_article_editorial_version on public.articles;
create trigger trg_90_snapshot_article_editorial_version
before update of
  slug,
  kind,
  category_id,
  story_cluster_id,
  headline,
  frontpage_headline,
  headline_accent_text,
  deck,
  body_markdown,
  author_name,
  author_title,
  author_portrait_url,
  hero_alt,
  hero_credit,
  hero_license,
  hero_license_url,
  hero_media_id,
  is_lead,
  lead_rank,
  is_breaking,
  breaking_last_update_at,
  breaking_until,
  source_metadata,
  editorial_metadata,
  topics,
  topic_key
on public.articles
for each row
execute function public.snapshot_article_version();

comment on function public.normalize_article_publication_state() is
  'Single mutating owner for article release metadata and publication timestamps; no synthetic QA delay.';

comment on function public.enforce_article_publication_contract() is
  'Single validation owner for scheduled hero detach protection, publication transition invariants, published media validity and same-cluster hero uniqueness.';
