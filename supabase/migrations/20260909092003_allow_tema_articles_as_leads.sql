create or replace function public.enforce_lead_type()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.is_lead = true and new.is_breaking = false then
    if new.category_id is null or not exists (
      select 1
      from public.categories c
      where c.id = new.category_id
        and c.slug = 'tema'
    ) then
      raise exception 'A non-breaking lead must belong to the Tema category';
    end if;
  end if;

  return new;
end;
$function$;
