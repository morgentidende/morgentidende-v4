-- Grandfather existing legacy Viden/Liv rows while preventing reactivation
-- into scheduled/published unless they satisfy the current magazine contract.

create or replace function public.enforce_article_category_kind()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_category_slug text;
  v_requires_current_contract boolean := false;
begin
  select lower(c.slug) into v_category_slug
  from public.categories c
  where c.id = new.category_id;

  if v_category_slug not in ('viden', 'liv') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_requires_current_contract := true;
  else
    -- A direct category/kind change is a new classification decision.
    if new.kind is distinct from old.kind
       or new.category_id is distinct from old.category_id then
      v_requires_current_contract := true;
    end if;

    -- Grandfather existing published legacy rows for ordinary edits and
    -- allow them to be unpublished, but require migration before any
    -- reactivation into an active publication state.
    if old.status is distinct from new.status
       and new.status in ('scheduled'::public.article_status, 'published'::public.article_status) then
      v_requires_current_contract := true;
    end if;
  end if;

  if v_requires_current_contract
     and new.kind is distinct from 'magazine'::public.article_kind then
    if tg_op = 'UPDATE'
       and old.status is distinct from new.status
       and new.status in ('scheduled'::public.article_status, 'published'::public.article_status) then
      raise exception 'legacy_magazine_reactivation_requires_migration';
    end if;
    raise exception 'kind_category_conflict';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_validate_article_category_kind on public.articles;
create trigger trg_validate_article_category_kind
before insert or update of kind, category_id, status
on public.articles
for each row
execute function public.enforce_article_category_kind();
