-- Keep article publication timestamps consistent without forcing all current
-- writers through a new RPC in one risky cut-over.

alter table public.articles
  add column if not exists first_published_at timestamptz,
  add column if not exists unpublished_at timestamptz;

-- Preserve historical first-publication evidence before normalizing current
-- live-state timestamps.
update public.articles
set first_published_at = published_at
where published_at is not null
  and first_published_at is null;

-- A non-published article is not currently live. Preserve its historical first
-- publication, record when it left the live state, and clear current published_at.
update public.articles
set unpublished_at = coalesce(unpublished_at, updated_at, published_at, clock_timestamp()),
    published_at = null
where status <> 'published'::public.article_status
  and published_at is not null;

create or replace function public.normalize_article_publication_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'published'::public.article_status then
    new.published_at := coalesce(new.published_at, clock_timestamp());
    new.first_published_at := coalesce(
      case when tg_op = 'UPDATE' then old.first_published_at else null end,
      new.first_published_at,
      new.published_at
    );
    new.unpublished_at := null;
  else
    if tg_op = 'UPDATE'
       and old.status = 'published'::public.article_status
       and new.status is distinct from old.status then
      new.unpublished_at := coalesce(new.unpublished_at, clock_timestamp());
    end if;
    new.published_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalize_article_publication_state on public.articles;
create trigger trg_normalize_article_publication_state
before insert or update of status, published_at, first_published_at, unpublished_at
on public.articles
for each row
execute function public.normalize_article_publication_state();

alter table public.articles
  drop constraint if exists articles_publication_state_timestamps_chk;

alter table public.articles
  add constraint articles_publication_state_timestamps_chk
  check (
    ((status = 'published'::public.article_status) = (published_at is not null))
    and (status <> 'published'::public.article_status or first_published_at is not null)
    and (status <> 'scheduled'::public.article_status or publish_at is not null)
  );
