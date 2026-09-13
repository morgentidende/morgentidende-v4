-- Keep article pages available even when an automation wraps sources in {"sources": [...]}.
-- Public output remains a flat source array and internal notes stay hidden.
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
  ) as source_metadata
from public.articles
where status = 'published'::public.article_status
  and published_at is not null
  and published_at <= now();

grant select on public.v4_public_articles to anon;
revoke all on public.v4_public_articles from authenticated;
