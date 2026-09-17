-- Make public API views honor caller RLS/privileges without exposing raw internal metadata.

create or replace function public.sanitize_public_source_metadata(p_source_metadata jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_agg(source_item.value - 'note'::text)
      from jsonb_array_elements(
        case
          when jsonb_typeof(p_source_metadata) = 'array' then p_source_metadata
          when jsonb_typeof(p_source_metadata) = 'object'
               and jsonb_typeof(p_source_metadata -> 'sources') = 'array'
            then p_source_metadata -> 'sources'
          else '[]'::jsonb
        end
      ) as source_item(value)
    ),
    '[]'::jsonb
  );
$$;

alter table public.articles
  add column if not exists public_source_metadata jsonb
    generated always as (public.sanitize_public_source_metadata(source_metadata)) stored,
  add column if not exists public_frontpage_destination text
    generated always as (
      case
        when editorial_metadata ->> 'frontpage_destination' in ('special_1','special_2')
          then editorial_metadata ->> 'frontpage_destination'
        else 'normal'
      end
    ) stored;

create or replace view public.v4_public_articles
with (security_invoker = true)
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
  a.topics,
  a.sagen_kort,
  a.public_source_metadata as source_metadata,
  a.hero_source_url,
  a.public_frontpage_destination as frontpage_destination
from public.articles a
where a.status = 'published'::public.article_status
  and a.published_at is not null
  and a.published_at <= now();

revoke all on public.articles from anon, authenticated;

grant select (
  id, slug, kind, category_id, story_cluster_id, headline, frontpage_headline,
  headline_accent_text, deck, body_markdown, author_name, author_title,
  author_portrait_url, hero_url, hero_alt, hero_credit, hero_license,
  hero_license_url, is_lead, lead_rank, is_breaking, breaking_last_update_at,
  breaking_until, published_at, created_at, editorial_updated_at, updated_at,
  topics, sagen_kort, public_source_metadata, hero_source_url,
  public_frontpage_destination, status
) on public.articles to anon, authenticated;

drop policy if exists articles_authenticated_public_read on public.articles;
create policy articles_authenticated_public_read
on public.articles
for select
to authenticated
using (
  status = 'published'::public.article_status
  and published_at is not null
  and published_at <= now()
);

create or replace view public.v4_public_special_sections
with (security_invoker = true)
as
select
  s.slot,
  s.label,
  s.story_cluster_id,
  c.slug as story_cluster_slug,
  c.title as story_cluster_title,
  s.updated_at
from public.frontpage_special_sections s
join public.story_clusters c on c.id = s.story_cluster_id
where s.active = true
  and c.active = true;

revoke all on public.frontpage_special_sections from anon, authenticated;
revoke all on public.story_clusters from anon, authenticated;

grant select (slot, label, story_cluster_id, updated_at, active)
  on public.frontpage_special_sections to anon, authenticated;
grant select (id, slug, title, active)
  on public.story_clusters to anon, authenticated;

drop policy if exists frontpage_special_sections_public_read on public.frontpage_special_sections;
create policy frontpage_special_sections_public_read
on public.frontpage_special_sections
for select
to anon, authenticated
using (active = true);

drop policy if exists clusters_authenticated_public_read on public.story_clusters;
create policy clusters_authenticated_public_read
on public.story_clusters
for select
to authenticated
using (active = true);

revoke all on public.v4_public_articles from public;
revoke all on public.v4_public_special_sections from public;
grant select on public.v4_public_articles to anon, authenticated;
grant select on public.v4_public_special_sections to anon, authenticated;

comment on view public.v4_public_articles is
  'Public article projection. SECURITY INVOKER; callers receive only published rows and only explicitly granted public columns. Raw editorial/source metadata remains inaccessible.';
comment on view public.v4_public_special_sections is
  'Public active special-section projection. SECURITY INVOKER; protected by caller RLS and column-level grants.';
