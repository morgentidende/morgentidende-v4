alter table public.articles
  add column if not exists topics text[] not null default '{}'::text[];

alter table public.articles
  drop constraint if exists articles_topics_max_three;
alter table public.articles
  add constraint articles_topics_max_three
  check (cardinality(topics) <= 3);

create index if not exists articles_topics_gin_idx
  on public.articles using gin (topics);

grant select (topics) on public.articles to anon, authenticated;

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
  a.editorial_updated_at as updated_at,
  a.updated_at as technical_updated_at,
  a.editorial_updated_at,
  a.topics
from public.articles a
where a.status = 'published'
  and a.published_at is not null
  and a.published_at <= now();

grant select on public.v4_public_articles to anon, authenticated;