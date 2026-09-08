update public.categories
set
  name = 'Analyse',
  slug = 'analyse',
  description = 'Analyser, perspektiv og forklaring af de vigtigste historier.',
  section_kind = 'analysis',
  nav_visible = true,
  is_magazine = false,
  active = true
where slug = 'tema';

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
