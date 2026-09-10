create or replace function public.apply_prepublication_qa_buffer()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_requested_at timestamptz;
  v_release_at timestamptz;
begin
  if new.status <> 'published'::public.article_status then
    return new;
  end if;

  -- Breaking news is intentionally immediate; QA happens after publication.
  if coalesce(new.is_breaking, false) then
    if new.published_at is null then
      new.published_at := coalesce(new.publish_at, v_now);
    end if;
    if new.publish_at is null then
      new.publish_at := new.published_at;
    end if;
    new.editorial_metadata := coalesce(new.editorial_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'qa_mode', 'post_publish_breaking',
        'qa_nonblocking', true
      );
    return new;
  end if;

  -- Apply the buffer only when an article first becomes publishable.
  if tg_op = 'INSERT' or old.status is distinct from 'published'::public.article_status then
    v_requested_at := coalesce(new.published_at, new.publish_at, v_now);
    v_release_at := greatest(v_requested_at, v_now + interval '5 minutes');

    new.publish_at := v_release_at;
    new.published_at := v_release_at;
    new.editorial_metadata := coalesce(new.editorial_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'qa_mode', 'prepublication_5m',
        'qa_nonblocking', true,
        'qa_scheduled_at', v_now,
        'qa_release_at', v_release_at,
        'qa_rule', 'release_at_is_hard_deadline_no_qa_gate'
      );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_prepublication_qa_buffer on public.articles;
create trigger trg_apply_prepublication_qa_buffer
before insert or update of status on public.articles
for each row
execute function public.apply_prepublication_qa_buffer();

insert into public.site_settings (key, value, updated_at)
values (
  'prepublication_qa_policy',
  jsonb_build_object(
    'enabled', true,
    'buffer_minutes', 5,
    'nonblocking', true,
    'hard_release_deadline', true,
    'breaking_bypass', true,
    'safe_auto_fixes', true,
    'meaning_changing_rewrites', false,
    'checks', jsonb_build_array(
      'spelling_and_grammar',
      'duplicate_paragraphs',
      'prompt_or_editorial_instruction_leakage',
      'editorial_rule_violations',
      'source_list_when_sources_exist',
      'source_links',
      'hero_presence_and_basic_metadata',
      'headline_deck_body_consistency'
    )
  ),
  now()
)
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;
