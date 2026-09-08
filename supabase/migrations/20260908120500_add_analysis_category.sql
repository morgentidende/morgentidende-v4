insert into public.categories(slug, name, description, section_kind, nav_visible, is_magazine, sort_order, active)
values (
  'analyse',
  'Analyse',
  'Analyser, perspektiv og forklaring af de vigtigste historier.',
  'analysis',
  true,
  false,
  45,
  true
)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  section_kind = excluded.section_kind,
  nav_visible = excluded.nav_visible,
  is_magazine = excluded.is_magazine,
  sort_order = excluded.sort_order,
  active = excluded.active;

with current_analysis_lead as (
  select id
  from public.articles
  where is_lead = true
    and is_breaking = false
  order by published_at desc nulls last, created_at desc
  limit 1
)
update public.articles
set category_id = (select id from public.categories where slug = 'analyse')
where id in (select id from current_analysis_lead);
