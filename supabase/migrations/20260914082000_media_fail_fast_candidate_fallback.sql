create or replace function public.classify_media_ingest_failure(p_http_status integer, p_result jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_error text := coalesce(p_result->>'error', '');
  v_status integer := 0;
begin
  if coalesce(p_result->>'status', '') ~ '^\d+$' then
    v_status := (p_result->>'status')::integer;
  end if;

  if coalesce(p_http_status, 0) >= 500 then
    return 'transient';
  end if;

  if v_error = 'source_fetch_failed'
     and (v_status in (408, 425, 429) or v_status >= 500) then
    return 'transient';
  end if;

  return 'permanent';
end;
$$;

create or replace function public.media_ingest_fail_fast_or_advance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_http_status integer := 0;
  v_class text;
  v_candidates jsonb;
  v_next jsonb;
  v_remaining jsonb;
  v_previous_url text;
begin
  -- Only classify structured ingest responses. Transport/runtime exceptions keep
  -- the existing retry schedule because they may recover on the next attempt.
  if new.status <> 'pending'
     or coalesce(new.last_error, '') !~ '^ingest_[0-9]+:' then
    return new;
  end if;

  if substring(new.last_error from '^ingest_([0-9]+):') ~ '^\d+$' then
    v_http_status := substring(new.last_error from '^ingest_([0-9]+):')::integer;
  end if;

  v_class := public.classify_media_ingest_failure(v_http_status, coalesce(new.result, '{}'::jsonb));
  if v_class = 'transient' then
    new.result := coalesce(new.result, '{}'::jsonb) || jsonb_build_object('failure_class', 'transient');
    return new;
  end if;

  v_candidates := coalesce(new.payload->'fallback_candidates', '[]'::jsonb);
  if jsonb_typeof(v_candidates) = 'array' and jsonb_array_length(v_candidates) > 0 then
    v_next := v_candidates->0;
    v_remaining := case
      when jsonb_array_length(v_candidates) > 1 then
        (select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
         from jsonb_array_elements(v_candidates) with ordinality
         where ordinality > 1)
      else '[]'::jsonb
    end;

    if coalesce(v_next->>'source_url', '') <> ''
       and coalesce((v_next->>'commercial_use_allowed')::boolean, false)
       and coalesce((v_next->>'local_storage_allowed')::boolean, false) then
      v_previous_url := new.payload->>'source_url';
      new.payload := (new.payload - 'fallback_candidates') || (v_next - 'fallback_candidates');
      new.payload := jsonb_set(new.payload, '{fallback_candidates}', v_remaining, true);
      new.payload := jsonb_set(
        new.payload,
        '{metadata}',
        coalesce(new.payload->'metadata', '{}'::jsonb)
          || jsonb_build_object(
               'fallback_from_source_url', v_previous_url,
               'fallback_advanced_at', now(),
               'fallback_reason', coalesce(new.result->>'error', 'permanent_ingest_failure')
             ),
        true
      );
      new.status := 'pending';
      new.attempts := 0;
      new.next_attempt_at := now();
      new.last_error := null;
      new.result := jsonb_build_object(
        'fallback_advanced', true,
        'previous_failure', coalesce(new.result, '{}'::jsonb)
      );
      return new;
    end if;
  end if;

  new.status := 'failed';
  new.result := coalesce(new.result, '{}'::jsonb)
    || jsonb_build_object('failure_class', 'permanent', 'terminal', true);
  return new;
end;
$$;

drop trigger if exists trg_media_ingest_fail_fast_or_advance on public.media_ingest_jobs;
create trigger trg_media_ingest_fail_fast_or_advance
before update on public.media_ingest_jobs
for each row
execute function public.media_ingest_fail_fast_or_advance();
