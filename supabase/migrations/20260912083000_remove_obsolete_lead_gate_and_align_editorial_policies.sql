-- Remove obsolete category coupling: a non-breaking lead is no longer forced into Tema.
-- Lead/breaking are presentation metadata and may be used across ordinary news categories.
drop trigger if exists articles_enforce_lead_type on public.articles;
drop function if exists public.enforce_lead_type();

-- Align durable linking policy with the current rule: no ordinary hyperlinks in article prose.
update public.site_settings
set value = jsonb_build_object(
  'principle', 'External links belong only in the source list; internal recommendations use structured Læs også relations.',
  'rules', jsonb_build_array(
    'Do not place external hyperlinks in article prose.',
    'All external source links belong only in the source list at the bottom when sources exist.',
    'Related Morgentidende articles must be presented through the structured Læs også relation system, not ordinary inline prose hyperlinks.',
    'Do not duplicate the same internal recommendation in multiple forms.'
  ),
  'applies_to', jsonb_build_array('all_news','all_articles','autonomous_editorial','chat_requested_write_and_publish'),
  'effective_date', '2026-09-12'
), updated_at = now()
where key = 'internal_linking_editorial_policy';
