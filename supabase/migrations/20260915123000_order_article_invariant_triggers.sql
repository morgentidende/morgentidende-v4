-- Make article BEFORE-trigger ordering explicit without changing trigger bodies.
-- PostgreSQL executes same-timing triggers alphabetically by trigger name.
-- Normalize/sync and contract validation should run before the publication gate.

alter trigger trg_sync_article_topic_key
  on public.articles rename to trg_00_sync_article_topic_key;

alter trigger trg_validate_article_category_kind
  on public.articles rename to trg_01_validate_article_category_kind;

alter trigger trg_validate_active_magazine_topic_key
  on public.articles rename to trg_02_validate_active_magazine_topic_key;

alter trigger trg_validate_article_followup_metadata
  on public.articles rename to trg_03_validate_article_followup_metadata;
