-- Reduce write amplification on public.articles without weakening publication gates.
--
-- 1) Merge the generic updated_at and published-editorial updated_at triggers.
-- 2) Keep article_versions as editorial history instead of recording QA/media/status churn.

create or replace function public.touch_article_timestamps()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  new.updated_at := v_now;

  if old.status = 'published'::public.article_status
     and new.status = 'published'::public.article_status
     and (
       new.headline is distinct from old.headline
       or new.deck is distinct from old.deck
       or new.body_markdown is distinct from old.body_markdown
     )
  then
    new.editorial_updated_at := v_now;
  end if;

  return new;
end;
$$;

drop trigger if exists articles_set_editorial_updated_at on public.articles;
drop trigger if exists articles_set_updated_at on public.articles;

drop function if exists public.set_editorial_updated_at();
drop function if exists public.set_updated_at();

create trigger articles_touch_timestamps
before update on public.articles
for each row
execute function public.touch_article_timestamps();

comment on function public.touch_article_timestamps() is
  'Owns technical updated_at for every article update and editorial_updated_at only for published headline/deck/body changes.';

create or replace function public.snapshot_article_version()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old_meta jsonb;
  v_new_meta jsonb;
  v_old_projection jsonb;
  v_new_projection jsonb;
  v_technical_meta_keys text[] := array[
    'github_queue_id',
    'github_payload_sha256',
    'publication_transport',
    'publication_requested_at',
    'qa_release_at',
    'qa_scheduled_at',
    'qa_mode',
    'qa_nonblocking',
    'qa_rule',
    'qa_breaking',
    'qa_stability',
    'qa_published_hash',
    'source_quality_at_publish',
    'publication_attention',
    'publication_path'
  ];
begin
  v_old_meta := coalesce(old.editorial_metadata, '{}'::jsonb) - v_technical_meta_keys;
  v_new_meta := coalesce(new.editorial_metadata, '{}'::jsonb) - v_technical_meta_keys;

  v_old_projection := jsonb_build_object(
    'slug', old.slug,
    'kind', old.kind,
    'category_id', old.category_id,
    'story_cluster_id', old.story_cluster_id,
    'headline', old.headline,
    'frontpage_headline', old.frontpage_headline,
    'headline_accent_text', old.headline_accent_text,
    'deck', old.deck,
    'body_markdown', old.body_markdown,
    'author_name', old.author_name,
    'author_title', old.author_title,
    'author_portrait_url', old.author_portrait_url,
    'hero_alt', old.hero_alt,
    'hero_credit', old.hero_credit,
    'hero_license', old.hero_license,
    'hero_license_url', old.hero_license_url,
    'hero_media_id', old.hero_media_id,
    'is_lead', old.is_lead,
    'lead_rank', old.lead_rank,
    'is_breaking', old.is_breaking,
    'breaking_last_update_at', old.breaking_last_update_at,
    'breaking_until', old.breaking_until,
    'source_metadata', old.source_metadata,
    'editorial_metadata', v_old_meta,
    'topics', old.topics,
    'topic_key', old.topic_key
  );

  v_new_projection := jsonb_build_object(
    'slug', new.slug,
    'kind', new.kind,
    'category_id', new.category_id,
    'story_cluster_id', new.story_cluster_id,
    'headline', new.headline,
    'frontpage_headline', new.frontpage_headline,
    'headline_accent_text', new.headline_accent_text,
    'deck', new.deck,
    'body_markdown', new.body_markdown,
    'author_name', new.author_name,
    'author_title', new.author_title,
    'author_portrait_url', new.author_portrait_url,
    'hero_alt', new.hero_alt,
    'hero_credit', new.hero_credit,
    'hero_license', new.hero_license,
    'hero_license_url', new.hero_license_url,
    'hero_media_id', new.hero_media_id,
    'is_lead', new.is_lead,
    'lead_rank', new.lead_rank,
    'is_breaking', new.is_breaking,
    'breaking_last_update_at', new.breaking_last_update_at,
    'breaking_until', new.breaking_until,
    'source_metadata', new.source_metadata,
    'editorial_metadata', v_new_meta,
    'topics', new.topics,
    'topic_key', new.topic_key
  );

  if v_old_projection is not distinct from v_new_projection then
    return new;
  end if;

  insert into public.article_versions(article_id, version_data)
  values (old.id, to_jsonb(old));

  return new;
end;
$$;

drop trigger if exists articles_snapshot_before_update on public.articles;
drop trigger if exists trg_zz_snapshot_article_editorial_version on public.articles;

create trigger trg_zz_snapshot_article_editorial_version
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

comment on function public.snapshot_article_version() is
  'Stores a pre-change article snapshot only when user-visible/editorial state actually changes; ignores publication, QA, transport and other technical churn.';
