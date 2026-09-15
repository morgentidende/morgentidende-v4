-- Fail closed on self-declared followups. A followup must point to a previously
-- published article in the same story cluster and carry a bounded reason code.

create or replace function public.validate_article_followup_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_story_kind text;
  v_parent_id uuid;
  v_reason text;
  v_parent public.articles%rowtype;
  v_topic_key text;
  v_parent_topic_key text;
begin
  v_story_kind := coalesce(nullif(new.editorial_metadata->>'story_kind',''),
    case when new.kind = 'magazine'::public.article_kind then 'evergreen_explainer' else 'news' end);

  if v_story_kind <> 'followup' then
    return new;
  end if;

  if new.story_cluster_id is null then
    raise exception 'followup_requires_cluster';
  end if;

  begin
    v_parent_id := nullif(new.editorial_metadata->>'followup_parent_article_id','')::uuid;
  exception when others then
    raise exception 'followup_parent_invalid';
  end;

  if v_parent_id is null then
    raise exception 'followup_requires_parent';
  end if;

  if v_parent_id = new.id then
    raise exception 'followup_parent_self_reference';
  end if;

  v_reason := nullif(new.editorial_metadata->>'followup_reason','');
  if v_reason is null or v_reason not in (
    'new_fact',
    'official_response',
    'arrest',
    'new_data',
    'court_decision',
    'material_update'
  ) then
    raise exception 'followup_requires_reason';
  end if;

  select * into v_parent
  from public.articles
  where id = v_parent_id;

  if not found then
    raise exception 'followup_parent_not_found';
  end if;

  if v_parent.status not in ('published'::public.article_status, 'unpublished'::public.article_status)
     or coalesce(v_parent.first_published_at, v_parent.published_at) is null then
    raise exception 'followup_parent_never_published';
  end if;

  if v_parent.story_cluster_id is distinct from new.story_cluster_id then
    raise exception 'followup_parent_cluster_mismatch';
  end if;

  if new.kind = 'magazine'::public.article_kind then
    v_topic_key := nullif(public.normalize_story_key(new.editorial_metadata->>'topic_key'), '');
    v_parent_topic_key := nullif(public.normalize_story_key(v_parent.editorial_metadata->>'topic_key'), '');

    if v_topic_key is not null
       and v_parent_topic_key is not null
       and v_topic_key is distinct from v_parent_topic_key then
      raise exception 'followup_topic_mismatch';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_article_followup_metadata on public.articles;
create trigger trg_validate_article_followup_metadata
before insert or update of editorial_metadata, story_cluster_id, kind
on public.articles
for each row
execute function public.validate_article_followup_metadata();
