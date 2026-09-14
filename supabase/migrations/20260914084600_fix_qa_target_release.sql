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
    p_requested_at + public.article_qa_minimum_buffer()
  );
end;
$$;
