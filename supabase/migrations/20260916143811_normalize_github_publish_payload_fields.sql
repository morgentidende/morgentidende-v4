-- Authoritative payload normalization for GitHub publish ingest.
-- deck is canonical; manchet is a temporary alias.
-- editorial_metadata.sagen_kort is canonical; top-level sagen_kort is a temporary alias.
-- story_cluster_id is UUID only. story_cluster_key resolves an existing slug.
-- Unknown slugs fail with story_cluster_not_found. Clusters are never auto-created here.

create or replace function public._normalize_sagen_kort_points(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path to public
as $$
begin
  if coalesce(jsonb_typeof(p_value), 'null') <> 'array' then
    raise exception 'sagen_kort_must_have_exactly_two_nonempty_points';
  end if;
  if jsonb_array_length(p_value) <> 2 then
    raise exception 'sagen_kort_must_have_exactly_two_nonempty_points';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_value) as point(value)
    where jsonb_typeof(point.value) <> 'string'
       or btrim(point.value #>> '{}') = ''
  ) then
    raise exception 'sagen_kort_must_have_exactly_two_nonempty_points';
  end if;
  return (
    select jsonb_agg(to_jsonb(btrim(point.value #>> '{}')) order by ordinality)
    from jsonb_array_elements(p_value) with ordinality as point(value, ordinality)
  );
end;
$$;

create or replace function public.normalize_github_publish_fields(p_payload jsonb)
returns jsonb
language plpgsql
stable
set search_path to public
as $$
declare
  v_deck text;
  v_manchet text;
  v_top_sagen jsonb;
  v_meta_sagen jsonb;
  v_sagen jsonb;
  v_cluster_id_text text;
  v_cluster_key text;
  v_cluster_from_id uuid;
  v_cluster_from_key uuid;
  v_cluster uuid;
  v_id_exists boolean;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload_must_be_object';
  end if;

  if p_payload ? 'deck' and jsonb_typeof(p_payload->'deck') is distinct from 'string' and p_payload->'deck' is not null then
    raise exception 'invalid_deck';
  end if;
  if p_payload ? 'manchet' and jsonb_typeof(p_payload->'manchet') is distinct from 'string' and p_payload->'manchet' is not null then
    raise exception 'invalid_manchet';
  end if;

  v_deck := nullif(btrim(coalesce(p_payload->>'deck', '')), '');
  v_manchet := nullif(btrim(coalesce(p_payload->>'manchet', '')), '');
  if v_deck is not null and char_length(v_deck) > 300 then
    raise exception 'deck_too_long';
  end if;
  if v_manchet is not null and char_length(v_manchet) > 300 then
    raise exception 'deck_too_long';
  end if;
  if v_deck is not null and v_manchet is not null and v_deck is distinct from v_manchet then
    raise exception 'deck_alias_conflict';
  end if;
  v_deck := coalesce(v_deck, v_manchet);

  v_top_sagen := case when p_payload ? 'sagen_kort' then p_payload->'sagen_kort' else null end;
  v_meta_sagen := case
    when coalesce(jsonb_typeof(p_payload->'editorial_metadata'), 'object') = 'object'
         and (p_payload->'editorial_metadata') ? 'sagen_kort'
      then p_payload->'editorial_metadata'->'sagen_kort'
    else null
  end;

  if v_top_sagen is not null then
    v_top_sagen := public._normalize_sagen_kort_points(v_top_sagen);
  end if;
  if v_meta_sagen is not null then
    v_meta_sagen := public._normalize_sagen_kort_points(v_meta_sagen);
  end if;
  if v_top_sagen is not null and v_meta_sagen is not null and v_top_sagen is distinct from v_meta_sagen then
    raise exception 'sagen_kort_alias_conflict';
  end if;
  v_sagen := coalesce(v_meta_sagen, v_top_sagen);

  v_cluster_id_text := nullif(btrim(coalesce(p_payload->>'story_cluster_id', '')), '');
  v_cluster_key := nullif(lower(btrim(coalesce(p_payload->>'story_cluster_key', ''))), '');

  if v_cluster_id_text is not null then
    begin
      v_cluster_from_id := v_cluster_id_text::uuid;
    exception when others then
      raise exception 'invalid_story_cluster_id';
    end;
    select exists(select 1 from public.story_clusters where id = v_cluster_from_id)
      into v_id_exists;
    if not v_id_exists then
      raise exception 'story_cluster_not_found:%', v_cluster_id_text;
    end if;
  end if;

  if v_cluster_key is not null then
    if v_cluster_key !~ '^[a-z0-9][a-z0-9-]{1,119}$' then
      raise exception 'invalid_story_cluster_key';
    end if;
    select id into v_cluster_from_key
    from public.story_clusters
    where slug = v_cluster_key
    limit 1;
    if v_cluster_from_key is null then
      raise exception 'story_cluster_not_found:%', v_cluster_key;
    end if;
  end if;

  if v_cluster_from_id is not null and v_cluster_from_key is not null
     and v_cluster_from_id is distinct from v_cluster_from_key then
    raise exception 'story_cluster_conflict';
  end if;

  v_cluster := coalesce(v_cluster_from_id, v_cluster_from_key);

  return jsonb_strip_nulls(jsonb_build_object(
    'deck', v_deck,
    'sagen_kort', v_sagen,
    'story_cluster_id', v_cluster
  ));
end;
$$;

revoke all on function public._normalize_sagen_kort_points(jsonb) from public, anon, authenticated;
revoke all on function public.normalize_github_publish_fields(jsonb) from public, anon, authenticated;
grant execute on function public._normalize_sagen_kort_points(jsonb) to service_role;
grant execute on function public.normalize_github_publish_fields(jsonb) to service_role;
