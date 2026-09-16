-- SAGEN KORT is structured data only. Normalize accidental body duplicates on
-- write and make the existing publication gate enforce the same invariant.

create or replace function public.strip_sagen_kort_from_markdown(p_body text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_body text := coalesce(p_body, '');
  v_lines text[];
  v_out text[] := array[]::text[];
  v_i integer;
  v_upper integer;
  v_cursor integer;
  v_line text;
begin
  -- Raw HTML occasionally arrives inside body_markdown. Remove an exact Sagen
  -- kort heading and an immediately following HTML list. The second pass also
  -- removes an exact standalone heading if no well-formed list follows.
  v_body := regexp_replace(
    v_body,
    '(?is)<h([1-6])[^>]*>[[:space:]]*sagen[[:space:]]+kort[[:space:]]*</h\1>[[:space:]]*<(ul|ol)[^>]*>.*?</\2>',
    '',
    'g'
  );
  v_body := regexp_replace(
    v_body,
    '(?is)<h([1-6])[^>]*>[[:space:]]*sagen[[:space:]]+kort[[:space:]]*</h\1>',
    '',
    'g'
  );

  v_lines := string_to_array(v_body, E'\n');
  v_i := coalesce(array_lower(v_lines, 1), 1);
  v_upper := coalesce(array_upper(v_lines, 1), 0);

  while v_i <= v_upper loop
    v_line := v_lines[v_i];

    if v_line ~* '^[[:space:]]{0,3}(#{1,6}[[:space:]]*)?sagen[[:space:]]+kort[[:space:]]*#*[[:space:]]*$' then
      v_cursor := v_i + 1;

      while v_cursor <= v_upper and btrim(v_lines[v_cursor]) = '' loop
        v_cursor := v_cursor + 1;
      end loop;

      if v_cursor <= v_upper
         and v_lines[v_cursor] ~ '^[[:space:]]*([-+*]|[0-9]+[.)])[[:space:]]+[^[:space:]]' then
        v_cursor := v_cursor + 1;
        while v_cursor <= v_upper loop
          if btrim(v_lines[v_cursor]) = ''
             or v_lines[v_cursor] ~ '^[[:space:]]*([-+*]|[0-9]+[.)])[[:space:]]+[^[:space:]]'
             or v_lines[v_cursor] ~ '^[[:space:]]{2,}[^[:space:]]' then
            v_cursor := v_cursor + 1;
          else
            exit;
          end if;
        end loop;
      end if;

      v_i := v_cursor;
      continue;
    end if;

    v_out := array_append(v_out, v_line);
    v_i := v_i + 1;
  end loop;

  return array_to_string(v_out, E'\n');
end;
$$;

create or replace function public.normalize_article_markdown_on_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_body text;
  v_normalized text;
begin
  v_body := coalesce(new.body_markdown, '');

  -- Some producer paths have historically serialized Markdown line breaks as
  -- literal backslash escapes. Decode only when the text otherwise contains no
  -- real newline, preserving the old conservative behavior.
  if position(E'\n' in v_body) = 0
     and (length(v_body) - length(replace(v_body, E'\\n', ''))) >= 4 then
    v_body := replace(v_body, E'\\r\\n', E'\n');
    v_body := replace(v_body, E'\\n', E'\n');
    v_body := replace(v_body, E'\\t', E'\t');
  end if;

  v_normalized := public.strip_sagen_kort_from_markdown(v_body);

  if v_normalized is distinct from v_body then
    raise log 'article_id=%, event=duplicate_sagen_kort_removed, source_stage=pre_publish', new.id;
  end if;

  new.body_markdown := v_normalized;
  return new;
end;
$$;

-- The existing trigger already calls normalize_article_markdown_on_write() on
-- INSERT and body_markdown UPDATE, so replacing the function upgrades all write
-- paths without adding another trigger.

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
  if coalesce(jsonb_typeof(v_sagen_kort), 'null') <> 'array'
     or jsonb_array_length(v_sagen_kort) <> 2
     or exists (
       select 1
       from jsonb_array_elements(v_sagen_kort) as point(value)
       where jsonb_typeof(point.value) <> 'string'
          or btrim(point.value #>> '{}') = ''
     ) then
    return 'sagen_kort_must_have_exactly_two_nonempty_points';
  end if;

  if public.strip_sagen_kort_from_markdown(coalesce(p_body_markdown, ''))
       is distinct from coalesce(p_body_markdown, '') then
    return 'sagen_kort_must_not_appear_in_body_markdown';
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

  if not p_check_duplicate then
    return null;
  end if;

  perform public.lock_article_dedupe_keys(p_headline, p_kind, p_topic_key);

  return public.article_duplicate_publication_error(
    p_article_id,
    p_headline,
    p_kind,
    p_topic_key,
    p_story_cluster_id,
    p_editorial_metadata,
    false
  );
end;
$function$;
