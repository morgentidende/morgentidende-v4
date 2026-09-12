-- Make v4_public_articles a true security-invoker view without exposing the
-- full private editorial_metadata JSON document.

-- Expose only the already-public Sagen kort projection as a generated column.
alter table public.articles
  add column if not exists sagen_kort jsonb
  generated always as (editorial_metadata -> 'sagen_kort') stored;

-- The public view already exposes source_metadata and sagen_kort, so grant only
-- those exact underlying columns needed by security_invoker evaluation.
grant select (source_metadata, sagen_kort) on public.articles to anon;

create or replace view public.v4_public_articles
with (security_invoker = true, security_barrier = true)
as
select
  id,
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
  hero_url,
  hero_alt,
  hero_credit,
  hero_license,
  hero_license_url,
  is_lead,
  lead_rank,
  is_breaking,
  breaking_last_update_at,
  breaking_until,
  published_at,
  created_at,
  editorial_updated_at as updated_at,
  updated_at as technical_updated_at,
  editorial_updated_at,
  topics,
  sagen_kort,
  source_metadata
from public.articles
where status = 'published'::public.article_status
  and published_at is not null
  and published_at <= now();

grant select on public.v4_public_articles to anon;
revoke all on public.v4_public_articles from authenticated;
