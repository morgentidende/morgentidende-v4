create extension if not exists pg_trgm with schema extensions;

create index if not exists articles_headline_trgm_idx
  on public.articles using gin (headline extensions.gin_trgm_ops)
  where status = 'published'::article_status;

create index if not exists articles_deck_trgm_idx
  on public.articles using gin (deck extensions.gin_trgm_ops)
  where status = 'published'::article_status and deck is not null;

create index if not exists articles_body_trgm_idx
  on public.articles using gin (body_markdown extensions.gin_trgm_ops)
  where status = 'published'::article_status;
