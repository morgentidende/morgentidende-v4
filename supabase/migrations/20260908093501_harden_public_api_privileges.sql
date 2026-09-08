-- Public read views should expose SELECT only.
revoke all privileges on table public.v4_public_articles from anon, authenticated;
revoke all privileges on table public.v4_public_categories from anon, authenticated;
revoke all privileges on table public.v4_public_clusters from anon, authenticated;
revoke all privileges on table public.v4_public_relations from anon, authenticated;

grant select on table public.v4_public_articles to anon, authenticated;
grant select on table public.v4_public_categories to anon, authenticated;
grant select on table public.v4_public_clusters to anon, authenticated;
grant select on table public.v4_public_relations to anon, authenticated;

-- These are trigger/internal functions, not client RPC endpoints.
revoke execute on function public.ensure_reciprocal_article_relation() from public, anon, authenticated;
revoke execute on function public.handle_new_reader() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.set_editorial_updated_at() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.snapshot_article_version() from public, anon, authenticated;
