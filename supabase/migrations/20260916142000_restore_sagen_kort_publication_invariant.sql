-- Restore the structured Sagen kort publication invariant after later gate
-- refactors replaced article_publication_transition_error_locked().
-- Keep the current post-dedupe architecture: this adds only the existing
-- Sagen kort and structured-body checks before the current base/follow-up gates.

create or replace function public.article_publication_transition_error_locked(
  p_article_id uuid,
  p_headline text,
  p_deck text,
  p_body_markdown text,
  p_hero_media_id uuid,
  p_hero_url text,
  p_source_metadata jsonb,
  p_editorial_metadata jsonb,
  p_kind public.article_kind,
  p_story_cluster_id uuid,
  p_topic_key text,
  p_check_duplicate boolean default true
)
returns text
language plpgsql
volatile
set search_path to 'public'
as $function$
declare
  v_error text;
  v_sagen_kort jsonb := coalesce(p_editorial_metadata, '{}'::jsonb) -> 'sagen_kort';
begin
  if coalesce(jsonb_typeof(v_sagen_kort), 'null') <> 'array' then
    return 'sagen_kort_must_have_exactly_two_nonempty_points';
  end if;

  if jsonb_array_length(v_sagen_kort) <> 2 then
    return 'sagen_kort_must_have_exactly_two_nonempty_points';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_sagen_kort) as point(value)
    where jsonb_typeof(point.value) <> 'string'
       or btrim(point.value #>> '{}') = ''
  ) then
    return 'sagen_kort_must_have_exactly_two_nonempty_points';
  end if;

  if public.strip_structured_sections_from_markdown(coalesce(p_body_markdown, ''))
       is distinct from coalesce(p_body_markdown, '') then
    return 'structured_sections_must_not_appear_in_body_markdown';
  end if;

  v_error := public.article_publication_error_for_values(
    p_article_id,
    p_headline,
    p_deck,
    p_body_markdown,
    p_hero_media_id,
    p_hero_url,
    p_source_metadata,
    p_editorial_metadata
  );
  if v_error is not null then
    return v_error;
  end if;

  v_error := public.article_followup_validation_error(
    p_article_id,
    p_kind,
    p_story_cluster_id,
    p_topic_key,
    p_editorial_metadata
  );
  if v_error is not null then
    return v_error;
  end if;

  return null;
end;
$function$;
