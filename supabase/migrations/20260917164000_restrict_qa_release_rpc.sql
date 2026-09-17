-- `release_qa_approved_articles` is an internal recovery/release function.
-- It runs as SECURITY DEFINER and must never be callable by public API roles.

revoke all on function public.release_qa_approved_articles(integer)
  from public, anon, authenticated;

grant execute on function public.release_qa_approved_articles(integer)
  to service_role;

comment on function public.release_qa_approved_articles(integer) is
  'Internal recovery release loop for due scheduled articles with valid media and publishable current-version QA. Executable only by postgres/service_role.';
