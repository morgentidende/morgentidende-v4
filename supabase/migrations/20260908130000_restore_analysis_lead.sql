-- Restore the analysis article that was unintentionally cleared when
-- non-breaking leads were restricted to the Analyse category.
with analyse as (
  select id from public.categories where slug = 'analyse'
)
update public.articles
set category_id = (select id from analyse),
    is_lead = true,
    lead_rank = 1
where slug = 'analyse-derfor-stemmer-flere-islamkritisk-europa-2026'
  and exists (select 1 from analyse);
