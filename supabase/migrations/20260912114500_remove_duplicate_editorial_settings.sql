-- Remove two legacy site_settings keys whose rules are now owned by
-- research_and_sources_editorial_policy. These keys are not referenced by
-- active database functions, Edge Functions, frontend code or workers.

delete from public.site_settings
where key in (
  'research_methodology_language_policy',
  'source_list_editorial_policy'
);
