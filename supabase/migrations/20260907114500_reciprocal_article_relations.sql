create or replace function public.ensure_reciprocal_article_relation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.relation_type in ('direct_related'::public.article_relation_type, 'follow_up'::public.article_relation_type) then
    insert into public.article_relations (
      article_id,
      related_article_id,
      relation_type,
      sort_order
    ) values (
      new.related_article_id,
      new.article_id,
      new.relation_type,
      new.sort_order
    )
    on conflict (article_id, related_article_id, relation_type) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists article_relations_make_reciprocal on public.article_relations;

create trigger article_relations_make_reciprocal
after insert on public.article_relations
for each row execute function public.ensure_reciprocal_article_relation();
