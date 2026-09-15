-- Editorial duplicate decisions are owned by final semantic QA in editorial-core.
-- Keep technical/source/media/follow-up publication invariants only.

create or replace function public.enforce_publish_qa_invariants()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare v_error text;
begin
  if tg_op = 'INSERT' and new.status = 'published'::public.article_status then
    raise exception 'publish_blocked: direct_published_insert_not_allowed';
  end if;

  if tg_op = 'UPDATE'
     and new.status = 'published'::public.article_status
     and old.status is distinct from 'published'::public.article_status then
    v_error := public.article_publication_error_for_values(
      new.id,new.headline,new.deck,new.body_markdown,new.hero_media_id,
      new.hero_url,new.source_metadata,new.editorial_metadata
    );
    if v_error is null then
      v_error := public.article_followup_validation_error(
        new.id,new.kind,new.story_cluster_id,new.topic_key,new.editorial_metadata
      );
    end if;
    if v_error is not null then raise exception 'publish_blocked: %', v_error; end if;
  end if;
  return new;
end;
$function$;
