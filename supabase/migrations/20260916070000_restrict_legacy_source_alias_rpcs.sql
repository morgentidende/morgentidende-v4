-- Keep legacy source-classification aliases for backend compatibility,
-- but remove them from the public PostgREST RPC surface.

revoke execute on function public.classify_editorial_source(jsonb) from public, anon, authenticated;
grant execute on function public.classify_editorial_source(jsonb) to service_role;

revoke execute on function public.evaluate_article_source_quality(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.evaluate_article_source_quality(jsonb, jsonb) to service_role;
