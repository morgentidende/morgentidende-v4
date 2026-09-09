create or replace function public.enforce_autopublish_stop()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  enabled boolean := true;
  entering_published boolean := false;
begin
  entering_published := new.status = 'published'::article_status
    and (tg_op = 'INSERT' or old.status is distinct from 'published'::article_status);

  if not entering_published then
    return new;
  end if;

  select coalesce((value #>> '{}')::boolean, true)
    into enabled
  from public.site_settings
  where key = 'autopublish_enabled';

  if coalesce(enabled, true) = false
     and coalesce(new.created_by, '') not in ('chat_manual', 'admin_manual') then
    raise exception 'autonomous publishing is disabled by autopublish_enabled';
  end if;

  return new;
end;
$$;

drop trigger if exists articles_enforce_autopublish_stop on public.articles;
create trigger articles_enforce_autopublish_stop
before insert or update of status, created_by on public.articles
for each row execute function public.enforce_autopublish_stop();

drop trigger if exists articles_snapshot_before_update on public.articles;
create trigger articles_snapshot_before_update
before update of
  slug, kind, status, category_id, story_cluster_id,
  headline, frontpage_headline, headline_accent_text, deck, body_markdown,
  author_name, author_title, author_portrait_url,
  hero_url, hero_alt, hero_source_url, hero_candidate_url, hero_candidate_note,
  hero_credit, hero_license, hero_license_url, hero_media_id,
  is_lead, lead_rank, is_breaking, breaking_last_update_at, breaking_until,
  publish_at, published_at, unpublished_at,
  source_metadata, editorial_metadata, topics
on public.articles
for each row execute function public.snapshot_article_version();
