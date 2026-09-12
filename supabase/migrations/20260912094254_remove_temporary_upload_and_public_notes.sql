-- Remove the expired one-file anonymous upload exception.
drop policy if exists "temporary chat ai hero upload" on storage.objects;

-- Preserve the public source list while excluding internal editorial notes.
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
  coalesce(
    (
      select jsonb_agg(source_item.value - 'note')
      from jsonb_array_elements(articles.source_metadata) as source_item(value)
    ),
    '[]'::jsonb
  ) as source_metadata
from public.articles
where status = 'published'::public.article_status
  and published_at is not null
  and published_at <= now();

grant select on public.v4_public_articles to anon;
revoke all on public.v4_public_articles from authenticated;
