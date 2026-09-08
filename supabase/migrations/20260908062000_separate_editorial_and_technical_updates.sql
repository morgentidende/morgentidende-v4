alter table public.articles
  add column if not exists editorial_updated_at timestamptz;

comment on column public.articles.editorial_updated_at is
  'Public editorial modification timestamp. Set only when published journalistic content changes; technical metadata changes must not set this field.';

create or replace function public.set_editorial_updated_at()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'published'::article_status
     and new.status = 'published'::article_status
     and (
       new.headline is distinct from old.headline
       or new.deck is distinct from old.deck
       or new.body_markdown is distinct from old.body_markdown
     )
  then
    new.editorial_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists articles_set_editorial_updated_at on public.articles;
create trigger articles_set_editorial_updated_at
before update on public.articles
for each row
execute function public.set_editorial_updated_at();

create or replace view public.v4_public_articles as
select
  a.id,
  a.slug,
  a.kind,
  a.category_id,
  a.story_cluster_id,
  a.headline,
  a.frontpage_headline,
  a.headline_accent_text,
  a.deck,
  a.body_markdown,
  a.author_name,
  a.author_title,
  a.author_portrait_url,
  a.hero_url,
  a.hero_alt,
  a.hero_credit,
  a.hero_license,
  a.hero_license_url,
  a.is_lead,
  a.lead_rank,
  a.is_breaking,
  a.breaking_last_update_at,
  a.breaking_until,
  a.published_at,
  a.created_at,
  a.editorial_updated_at as updated_at,
  a.updated_at as technical_updated_at,
  a.editorial_updated_at
from public.articles a
where a.status = 'published'::article_status
  and a.published_at is not null
  and a.published_at <= now();
