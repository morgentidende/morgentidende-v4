create or replace function public.prevent_duplicate_cluster_hero()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'published'::public.article_status
     and new.story_cluster_id is not null
     and new.hero_media_id is not null
     and exists (
       select 1
       from public.articles other
       where other.id <> new.id
         and other.status = 'published'::public.article_status
         and other.story_cluster_id = new.story_cluster_id
         and other.hero_media_id = new.hero_media_id
     ) then
    raise exception 'published articles in the same story cluster must use distinct hero media';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_duplicate_cluster_hero on public.articles;
create trigger trg_prevent_duplicate_cluster_hero
before insert or update of status, story_cluster_id, hero_media_id
on public.articles
for each row
execute function public.prevent_duplicate_cluster_hero();
