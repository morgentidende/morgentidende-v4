-- Restore the public hero source URL expected by the article frontend.
-- This is the public origin/source link used for image attribution, not an internal note.
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
      from jsonb_array_elements(
        case
          when jsonb_typeof(articles.source_metadata) = 'array' then articles.source_metadata
          when jsonb_typeof(articles.source_metadata) = 'object'
            and jsonb_typeof(articles.source_metadata -> 'sources') = 'array'
            then articles.source_metadata -> 'sources'
          else '[]'::jsonb
        end
      ) as source_item(value)
    ),
    '[]'::jsonb
  ) as source_metadata,
  hero_source_url
from public.articles
where status = 'published'::public.article_status
  and published_at is not null
  and published_at <= now();

-- security_invoker means anon must also be allowed to read every underlying
-- column referenced by the view (including the status visibility predicate).
-- Keep this explicit list aligned with the public view instead of granting
-- table-wide SELECT, so private editorial columns remain inaccessible.
grant select (
  id, slug, kind, category_id, story_cluster_id, headline, frontpage_headline,
  headline_accent_text, deck, body_markdown, author_name, author_title,
  author_portrait_url, hero_url, hero_alt, hero_source_url, hero_credit,
  hero_license, hero_license_url, is_lead, lead_rank, is_breaking,
  breaking_last_update_at, breaking_until, published_at, created_at,
  editorial_updated_at, updated_at, topics, sagen_kort, source_metadata, status
) on public.articles to anon;

grant select on public.v4_public_articles to anon;
revoke all on public.v4_public_articles from authenticated;

-- Operational smoke test after deployment:
--   begin; set local role anon;
--   select id, slug, headline from public.v4_public_articles limit 1;
--   rollback;
-- If a future public-view column is added without the matching column grant,
-- this test fails immediately instead of surfacing later as a site-wide 503.
