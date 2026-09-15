-- No runtime path should own a second editorial 7-day duplicate decision.
drop function if exists public.lock_article_dedupe_keys(text, public.article_kind, text);
drop function if exists public.article_duplicate_publication_error(uuid, text, public.article_kind, text, uuid, jsonb, boolean);
