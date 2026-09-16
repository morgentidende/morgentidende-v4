create or replace function public.article_publication_block_is_terminal(p_article_id uuid, p_reason text)
returns boolean
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_qa_state jsonb;
  v_qa_stability_state text;
begin
  if p_reason = 'source_quality:no_authoritative_source' then
    return true;
  end if;

  if p_reason = 'missing_hero_media_id' then
    return not exists (
      select 1
      from public.media_ingest_jobs j
      where j.article_id = p_article_id
        and j.status in ('pending','processing')
    );
  end if;

  if p_reason = 'qa_not_complete_for_current_version' then
    v_qa_state := public.article_current_qa_state(p_article_id);

    if coalesce(v_qa_state->>'qa_status','missing') = 'failed' then
      return true;
    end if;

    select a.editorial_metadata #>> '{qa_stability,state}'
      into v_qa_stability_state
    from public.articles a
    where a.id = p_article_id;

    if v_qa_stability_state = 'attention_required' then
      return true;
    end if;
  end if;

  return false;
end;
$function$;
