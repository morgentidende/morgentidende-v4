-- Keep the pure duplicate checker honestly STABLE by using a stable cutoff.
create or replace function public.article_duplicate_publication_error(
  p_article_id uuid,
  p_headline text,
  p_kind public.article_kind,
  p_topic_key text,
  p_story_cluster_id uuid,
  p_editorial_metadata jsonb,
  p_include_scheduled boolean default false
)
returns text
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_headline_key text;
  v_topic_key text;
  v_story_kind text;
  v_followup_error text;
  v_valid_followup boolean := false;
  v_duplicate_id uuid;
  v_cutoff timestamptz := statement_timestamp() - interval '7 days';
begin
  v_headline_key := public.normalize_story_key(p_headline);
  v_topic_key := nullif(public.normalize_story_key(p_topic_key), '');
  v_story_kind := coalesce(
    nullif(coalesce(p_editorial_metadata, '{}'::jsonb)->>'story_kind',''),
    case when p_kind = 'magazine'::public.article_kind then 'evergreen_explainer' else 'news' end
  );

  if v_story_kind = 'followup' then
    v_followup_error := public.article_followup_validation_error(
      p_article_id,
      p_kind,
      p_story_cluster_id,
      v_topic_key,
      p_editorial_metadata
    );
    v_valid_followup := v_followup_error is null;
  end if;

  select a.id into v_duplicate_id
  from public.articles a
  where a.id is distinct from p_article_id
    and (
      (
        p_include_scheduled
        and a.status in ('published'::public.article_status, 'scheduled'::public.article_status)
        and coalesce(a.published_at, a.publish_at, a.created_at) >= v_cutoff
      )
      or
      (
        not p_include_scheduled
        and a.status = 'published'::public.article_status
        and a.published_at >= v_cutoff
      )
    )
    and public.normalize_story_key(a.headline) = v_headline_key
  order by coalesce(a.published_at, a.publish_at, a.created_at) desc
  limit 1;

  if v_duplicate_id is not null then
    return 'duplicate_7d_exact:' || v_duplicate_id::text;
  end if;

  if p_kind = 'magazine'::public.article_kind
     and v_topic_key is not null
     and not v_valid_followup then
    select a.id into v_duplicate_id
    from public.articles a
    where a.id is distinct from p_article_id
      and (
        (
          p_include_scheduled
          and a.status in ('published'::public.article_status, 'scheduled'::public.article_status)
          and coalesce(a.published_at, a.publish_at, a.created_at) >= v_cutoff
        )
        or
        (
          not p_include_scheduled
          and a.status = 'published'::public.article_status
          and a.published_at >= v_cutoff
        )
      )
      and a.topic_key = v_topic_key
    order by coalesce(a.published_at, a.publish_at, a.created_at) desc
    limit 1;

    if v_duplicate_id is not null then
      return 'duplicate_7d_topic:' || v_duplicate_id::text;
    end if;
  end if;

  return null;
end;
$function$;
