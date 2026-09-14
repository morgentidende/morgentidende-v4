create or replace function public.apply_prepublication_qa_buffer()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_requested_at timestamptz;
  v_release_at timestamptz;
  v_existing_release timestamptz;
  v_entering_buffer boolean := false;
begin
  if new.status <> 'published'::public.article_status then
    return new;
  end if;

  v_entering_buffer := tg_op = 'INSERT'
    or old.status is distinct from 'published'::public.article_status
    or old.is_breaking is distinct from new.is_breaking;

  if v_entering_buffer then
    begin
      v_requested_at := nullif(new.editorial_metadata->>'publication_requested_at','')::timestamptz;
    exception when others then
      v_requested_at := null;
    end;

    v_requested_at := coalesce(v_requested_at, new.published_at, new.publish_at, v_now);
    v_release_at := greatest(v_requested_at + interval '2 minutes', v_now);

    new.publish_at := v_release_at;
    new.published_at := v_release_at;
    new.editorial_metadata := coalesce(new.editorial_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'qa_mode','prepublication_2m',
        'qa_nonblocking',true,
        'qa_scheduled_at',v_requested_at,
        'qa_release_at',v_release_at,
        'qa_rule','release_at_is_hard_deadline_no_qa_gate',
        'qa_breaking',coalesce(new.is_breaking,false)
      );
    return new;
  end if;

  begin
    v_existing_release := nullif(new.editorial_metadata->>'qa_release_at','')::timestamptz;
  exception when others then
    v_existing_release := null;
  end;

  if v_existing_release is not null then
    if new.publish_at is null or new.publish_at < v_existing_release then new.publish_at := v_existing_release; end if;
    if new.published_at is null or new.published_at < v_existing_release then new.published_at := v_existing_release; end if;
  end if;

  return new;
end;
$function$;
