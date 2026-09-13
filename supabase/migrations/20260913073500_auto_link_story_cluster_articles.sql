create or replace function public.link_published_story_cluster_articles()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  peer record;
  next_sort integer;
begin
  if new.status <> 'published'::public.article_status or new.story_cluster_id is null then
    return new;
  end if;

  for peer in
    select a.id
    from public.articles a
    where a.story_cluster_id = new.story_cluster_id
      and a.id <> new.id
      and a.status = 'published'::public.article_status
    order by a.published_at nulls last, a.created_at
  loop
    select coalesce(max(ar.sort_order), 0) + 1
      into next_sort
    from public.article_relations ar
    where ar.article_id = peer.id
      and ar.relation_type = 'direct_related'::public.article_relation_type;

    insert into public.article_relations (
      article_id,
      related_article_id,
      relation_type,
      sort_order
    ) values (
      peer.id,
      new.id,
      'direct_related'::public.article_relation_type,
      next_sort
    )
    on conflict (article_id, related_article_id, relation_type) do nothing;
  end loop;

  return new;
end;
$$;

drop trigger if exists articles_link_story_cluster_after_publish on public.articles;

create trigger articles_link_story_cluster_after_publish
after insert or update of status, story_cluster_id on public.articles
for each row
when (new.status = 'published'::public.article_status and new.story_cluster_id is not null)
execute function public.link_published_story_cluster_articles();

-- Backfill published clusters so older articles also gain links to later additions.
do $$
declare
  newer record;
  older record;
  next_sort integer;
begin
  for newer in
    select id, story_cluster_id, published_at, created_at
    from public.articles
    where status = 'published'::public.article_status
      and story_cluster_id is not null
    order by published_at nulls last, created_at
  loop
    for older in
      select id
      from public.articles
      where story_cluster_id = newer.story_cluster_id
        and id <> newer.id
        and status = 'published'::public.article_status
        and coalesce(published_at, created_at) <= coalesce(newer.published_at, newer.created_at)
      order by published_at nulls last, created_at
    loop
      select coalesce(max(ar.sort_order), 0) + 1
        into next_sort
      from public.article_relations ar
      where ar.article_id = older.id
        and ar.relation_type = 'direct_related'::public.article_relation_type;

      insert into public.article_relations (
        article_id,
        related_article_id,
        relation_type,
        sort_order
      ) values (
        older.id,
        newer.id,
        'direct_related'::public.article_relation_type,
        next_sort
      )
      on conflict (article_id, related_article_id, relation_type) do nothing;
    end loop;
  end loop;
end;
$$;
