-- Keep source_metadata in one canonical shape at rest.
-- Journalists should write a top-level JSON array. The trigger tolerates the
-- previously-seen {"sources": [...]} wrapper and normalizes it before storage.

create or replace function public.normalize_article_source_metadata()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.source_metadata is null then
    new.source_metadata := '[]'::jsonb;
  elsif jsonb_typeof(new.source_metadata) = 'array' then
    null;
  elsif jsonb_typeof(new.source_metadata) = 'object'
    and jsonb_typeof(new.source_metadata -> 'sources') = 'array' then
    new.source_metadata := new.source_metadata -> 'sources';
  else
    new.source_metadata := '[]'::jsonb;
  end if;

  return new;
end;
$function$;

drop trigger if exists normalize_article_source_metadata_before_write on public.articles;
create trigger normalize_article_source_metadata_before_write
before insert or update of source_metadata on public.articles
for each row
execute function public.normalize_article_source_metadata();

update public.articles
set source_metadata = case
  when source_metadata is null then '[]'::jsonb
  when jsonb_typeof(source_metadata) = 'array' then source_metadata
  when jsonb_typeof(source_metadata) = 'object'
    and jsonb_typeof(source_metadata -> 'sources') = 'array'
    then source_metadata -> 'sources'
  else '[]'::jsonb
end
where source_metadata is null
   or jsonb_typeof(source_metadata) <> 'array';

alter table public.articles
  drop constraint if exists articles_source_metadata_is_array;

alter table public.articles
  add constraint articles_source_metadata_is_array
  check (jsonb_typeof(source_metadata) = 'array');
