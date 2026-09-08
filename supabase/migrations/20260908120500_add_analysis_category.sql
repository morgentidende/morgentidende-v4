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

-- Remove legacy non-breaking leads that are not analyses.
update public.articles a
set is_lead = false,
    lead_rank = null
where a.is_lead = true
  and a.is_breaking = false
  and not exists (
    select 1
    from public.categories c
    where c.id = a.category_id
      and c.slug = 'analyse'
  );

create or replace function public.enforce_lead_type()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.is_lead = true and new.is_breaking = false then
    if new.category_id is null or not exists (
      select 1
      from public.categories c
      where c.id = new.category_id
        and c.slug = 'analyse'
    ) then
      raise exception 'A non-breaking lead must belong to the Analyse category';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_lead_type() from public, anon, authenticated;

drop trigger if exists articles_enforce_lead_type on public.articles;
create trigger articles_enforce_lead_type
before insert or update of is_lead, is_breaking, category_id on public.articles
for each row execute function public.enforce_lead_type();
