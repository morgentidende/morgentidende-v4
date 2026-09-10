-- Reader authentication has been removed. Public readers use only the anon role.
-- Editorial and media workflows continue to use service_role.

-- Remove any explicit privileges previously granted to authenticated users.
revoke all privileges on table public.categories from authenticated;
revoke all privileges on table public.story_clusters from authenticated;
revoke all privileges on table public.articles from authenticated;
revoke all privileges on table public.article_relations from authenticated;
revoke all privileges on table public.article_versions from authenticated;
revoke all privileges on table public.site_settings from authenticated;
revoke all privileges on table public.v4_public_categories from authenticated;
revoke all privileges on table public.v4_public_clusters from authenticated;
revoke all privileges on table public.v4_public_articles from authenticated;
revoke all privileges on table public.v4_public_relations from authenticated;

-- Optional/newer tables may not exist in every environment yet.
do $$
begin
  if to_regclass('public.article_topics') is not null then
    execute 'revoke all privileges on table public.article_topics from authenticated';
  end if;
  if to_regclass('public.media_assets') is not null then
    execute 'revoke all privileges on table public.media_assets from authenticated';
  end if;
  if to_regclass('public.media_ingest_jobs') is not null then
    execute 'revoke all privileges on table public.media_ingest_jobs from authenticated';
  end if;
end
$$;

-- Remove authenticated from client-facing RLS policies. Recreate the public read
-- policies for anon only; service_role bypasses RLS as before.
drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories
for select to anon
using (active = true);

drop policy if exists clusters_public_read on public.story_clusters;
create policy clusters_public_read on public.story_clusters
for select to anon
using (active = true);

drop policy if exists articles_public_read on public.articles;
create policy articles_public_read on public.articles
for select to anon
using (
  status = 'published'
  and published_at is not null
  and published_at <= now()
);

drop policy if exists relations_public_read on public.article_relations;
create policy relations_public_read on public.article_relations
for select to anon
using (
  exists (
    select 1 from public.articles a
    where a.id = article_id
      and a.status = 'published'
      and a.published_at is not null
      and a.published_at <= now()
  )
  and exists (
    select 1 from public.articles ra
    where ra.id = related_article_id
      and ra.status = 'published'
      and ra.published_at is not null
      and ra.published_at <= now()
  )
);

-- Keep future objects deny-by-default for authenticated users.
alter default privileges for role postgres in schema public
  revoke all on tables from authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from authenticated;
