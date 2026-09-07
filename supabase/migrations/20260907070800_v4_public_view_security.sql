grant select (id, slug, name, description, section_kind, nav_visible, is_magazine, sort_order, active) on public.categories to anon, authenticated;
grant select (id, slug, title, summary, active, created_at, updated_at) on public.story_clusters to anon, authenticated;
grant select (
  id, slug, kind, status, category_id, story_cluster_id,
  headline, frontpage_headline, headline_accent_text, deck, body_markdown,
  author_name, author_title, author_portrait_url,
  hero_url, hero_alt, hero_credit, hero_license, hero_license_url,
  is_lead, lead_rank, is_breaking, breaking_last_update_at, breaking_until,
  published_at, created_at, updated_at
) on public.articles to anon, authenticated;
grant select (id, article_id, related_article_id, relation_type, sort_order) on public.article_relations to anon, authenticated;

create or replace view public.v4_public_categories
with (security_invoker = true, security_barrier = true)
as
select id, slug, name, description, section_kind, nav_visible, is_magazine, sort_order
from public.categories
where active = true;

create or replace view public.v4_public_clusters
with (security_invoker = true, security_barrier = true)
as
select id, slug, title, summary, created_at, updated_at
from public.story_clusters
where active = true;

create or replace view public.v4_public_articles
with (security_invoker = true, security_barrier = true)
as
select
  a.id,
  a.slug,
  a.kind,
  a.category_id,
  a.story_cluster_id,
  a.headline,
  a.frontpage_headline,
  a.headline_accent_text,
  a.deck,
  a.body_markdown,
  a.author_name,
  a.author_title,
  a.author_portrait_url,
  a.hero_url,
  a.hero_alt,
  a.hero_credit,
  a.hero_license,
  a.hero_license_url,
  a.is_lead,
  a.lead_rank,
  a.is_breaking,
  a.breaking_last_update_at,
  a.breaking_until,
  a.published_at,
  a.created_at,
  a.updated_at
from public.articles a
where a.status = 'published'
  and a.published_at is not null
  and a.published_at <= now();

create or replace view public.v4_public_relations
with (security_invoker = true, security_barrier = true)
as
select
  r.id,
  r.article_id,
  r.related_article_id,
  r.relation_type,
  r.sort_order
from public.article_relations r
join public.articles a on a.id = r.article_id
join public.articles ra on ra.id = r.related_article_id
where a.status = 'published'
  and a.published_at is not null
  and a.published_at <= now()
  and ra.status = 'published'
  and ra.published_at is not null
  and ra.published_at <= now();

create policy article_versions_deny_client on public.article_versions
for all to anon, authenticated
using (false)
with check (false);

create policy site_settings_deny_client on public.site_settings
for all to anon, authenticated
using (false)
with check (false);
