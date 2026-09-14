create or replace function public.normalize_live_update_body_linebreaks()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.body is not null then
    new.body := replace(new.body, E'\\r\\n', E'\n');
    new.body := replace(new.body, E'\\n', E'\n');
    new.body := replace(new.body, E'\\r', E'\n');
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_live_update_body_linebreaks on public.live_updates;
create trigger normalize_live_update_body_linebreaks
before insert or update of body on public.live_updates
for each row
execute function public.normalize_live_update_body_linebreaks();

update public.live_updates
set body = replace(replace(replace(body, E'\\r\\n', E'\n'), E'\\n', E'\n'), E'\\r', E'\n')
where body like E'%\\n%' or body like E'%\\r%';
