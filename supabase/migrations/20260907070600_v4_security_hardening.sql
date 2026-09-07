revoke all on table public.categories from anon, authenticated;
revoke all on table public.story_clusters from anon, authenticated;
revoke all on table public.articles from anon, authenticated;
revoke all on table public.article_relations from anon, authenticated;
revoke all on table public.article_versions from anon, authenticated;
revoke all on table public.site_settings from anon, authenticated;
revoke all on table public.reader_profiles from anon, authenticated;

grant select on public.reader_profiles to authenticated;
grant update (display_name) on public.reader_profiles to authenticated;

revoke execute on function public.handle_new_reader() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

create or replace view public.v4_public_categories
with (security_barrier = true)
as
select id, slug, name, description, section_kind, nav_visible, is_magazine, sort_order
from public.categories
where active = true;

create or replace view public.v4_public_clusters
with (security_barrier = true)
as
select id, slug, title, summary, created_at, updated_at
from public.story_clusters
where active = true;

create or replace view public.v4_public_articles
with (security_barrier = true)
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
with (security_barrier = true)
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

grant select on public.v4_public_categories to anon, authenticated;
grant select on public.v4_public_clusters to anon, authenticated;
grant select on public.v4_public_articles to anon, authenticated;
grant select on public.v4_public_relations to anon, authenticated;
