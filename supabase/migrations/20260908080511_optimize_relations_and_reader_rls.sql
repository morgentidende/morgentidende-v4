create index if not exists article_relations_related_article_idx
  on public.article_relations(related_article_id);

drop policy if exists reader_profile_self_read on public.reader_profiles;
create policy reader_profile_self_read on public.reader_profiles
for select to authenticated
using ((select auth.uid()) = id);

drop policy if exists reader_profile_self_update on public.reader_profiles;
create policy reader_profile_self_update on public.reader_profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
