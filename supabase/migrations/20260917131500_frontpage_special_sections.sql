create table if not exists public.frontpage_special_sections (
  slot smallint primary key check (slot in (1,2)),
  label text not null check (length(trim(label)) between 1 and 80),
  story_cluster_id uuid not null references public.story_clusters(id) on delete restrict,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

revoke all on public.frontpage_special_sections from anon, authenticated;

drop view if exists public.v4_public_special_sections;
create view public.v4_public_special_sections as
select s.slot,
       s.label,
       s.story_cluster_id,
       c.slug as story_cluster_slug,
       c.title as story_cluster_title,
       s.updated_at
from public.frontpage_special_sections s
join public.story_clusters c on c.id = s.story_cluster_id
where s.active = true
  and c.active = true;

grant select on public.v4_public_special_sections to anon, authenticated;

insert into public.frontpage_special_sections(slot, label, story_cluster_id, active)
select 1, 'CEUTA', id, true
from public.story_clusters
where slug = 'ceuta-migrationskrise-2026'
on conflict (slot) do update
set label = excluded.label,
    story_cluster_id = excluded.story_cluster_id,
    active = true,
    updated_at = now();

insert into public.frontpage_special_sections(slot, label, story_cluster_id, active)
select 2, 'SVERIGE VÆLGER', id, true
from public.story_clusters
where slug = 'sverige-valg-2026'
on conflict (slot) do update
set label = excluded.label,
    story_cluster_id = excluded.story_cluster_id,
    active = true,
    updated_at = now();

create or replace view public.v4_public_articles as
select id,
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
       coalesce((select jsonb_agg(source_item.value - 'note')
                 from jsonb_array_elements(
                   case
                     when jsonb_typeof(articles.source_metadata) = 'array' then articles.source_metadata
                     when jsonb_typeof(articles.source_metadata) = 'object'
                      and jsonb_typeof(articles.source_metadata -> 'sources') = 'array' then articles.source_metadata -> 'sources'
                     else '[]'::jsonb
                   end
                 ) source_item(value)), '[]'::jsonb) as source_metadata,
       hero_source_url,
       case
         when editorial_metadata->>'frontpage_destination' in ('special_1','special_2')
           then editorial_metadata->>'frontpage_destination'
         else 'normal'
       end as frontpage_destination
from public.articles
where status = 'published'::public.article_status
  and published_at is not null
  and published_at <= now();

grant select on public.v4_public_articles to anon, authenticated;

update public.articles a
set editorial_metadata = coalesce(a.editorial_metadata, '{}'::jsonb) || jsonb_build_object('frontpage_destination','special_1')
from public.story_clusters c
where a.story_cluster_id = c.id
  and c.slug = 'ceuta-migrationskrise-2026'
  and a.status = 'published'::public.article_status
  and coalesce(a.editorial_metadata->>'frontpage_destination','normal') = 'normal';

update public.articles a
set editorial_metadata = coalesce(a.editorial_metadata, '{}'::jsonb) || jsonb_build_object('frontpage_destination','special_2')
from public.story_clusters c
where a.story_cluster_id = c.id
  and c.slug = 'sverige-valg-2026'
  and a.status = 'published'::public.article_status
  and coalesce(a.editorial_metadata->>'frontpage_destination','normal') = 'normal';
