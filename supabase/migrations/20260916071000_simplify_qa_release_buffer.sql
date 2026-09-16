-- Keep one release-time calculation and make the watchdog read the stored release.
-- Current scheduled rows all have editorial_metadata.qa_release_at, and the
-- prepublication trigger writes it whenever an article enters scheduled state.

create or replace function public.article_qa_target_release_at(
  p_metadata jsonb,
  p_publish_at timestamptz,
  p_requested_at timestamptz
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_existing_release timestamptz;
begin
  begin
    v_existing_release := nullif(p_metadata->>'qa_release_at','')::timestamptz;
  exception when others then
    v_existing_release := null;
  end;

  if v_existing_release is not null then
    return v_existing_release;
  end if;

  return greatest(
    coalesce(p_publish_at, p_requested_at),
    p_requested_at + interval '45 seconds'
  );
end;
$$;

-- Keep the existing two-argument signature for compatibility, but make this
-- a pure reader of the canonical stored release timestamp. p_publish_at is
-- intentionally retained but no longer used as a fallback.
create or replace function public.article_qa_release_at(
  p_metadata jsonb,
  p_publish_at timestamptz
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_release_at timestamptz;
begin
  begin
    v_release_at := nullif(p_metadata->>'qa_release_at','')::timestamptz;
  exception when others then
    v_release_at := null;
  end;

  return v_release_at;
end;
$$;

drop function public.article_qa_minimum_buffer();
