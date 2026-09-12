-- The public articles view currently depends on a private editorial_metadata column
-- for the derived `sagen_kort` field. Enabling security_invoker without exposing
-- that full private column breaks anonymous reads. Keep the view in definer mode
-- for now rather than widening direct table access to editorial metadata.
alter view public.v4_public_articles set (security_invoker = false, security_barrier = true);
