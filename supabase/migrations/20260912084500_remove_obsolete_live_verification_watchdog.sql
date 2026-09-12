-- External live/crawler verification is now explicitly non-blocking and optional.
-- The watchdog should monitor scheduler starts and publication stalls, not create
-- false alerts merely because a live_verified checkpoint is absent.
create or replace function public.run_automation_watchdog()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  r record;
  v_has_start boolean;
  v_has_terminal boolean;
begin
  for r in
    with expected as (
      select '6aa46ef2a66c8191bc0007310e83427a'::text automation_id,
             'Nyhed – hel time'::text automation_title,
             gs slot_at
      from generate_series(date_trunc('hour', v_now - interval '4 hours'), date_trunc('hour', v_now), interval '1 hour') gs
      union all
      select '6aa448bb8ca48191b97259160873bbad'::text,
             'Nyhed – halv time'::text,
             gs + interval '30 minutes'
      from generate_series(date_trunc('hour', v_now - interval '4 hours'), date_trunc('hour', v_now), interval '1 hour') gs
    )
    select * from expected where slot_at <= v_now - interval '20 minutes'
  loop
    select exists (
      select 1 from public.automation_run_events e
      where e.automation_id=r.automation_id and e.stage='start'
        and e.created_at between r.slot_at - interval '10 minutes' and r.slot_at + interval '20 minutes'
    ) into v_has_start;

    if not v_has_start then
      insert into public.automation_watchdog_alerts(automation_id,automation_title,slot_at,issue_type,details)
      values(r.automation_id,r.automation_title,r.slot_at,'scheduler_missed',jsonb_build_object('grace_minutes',20,'jitter_early_minutes',10))
      on conflict (automation_id,slot_at,issue_type) do nothing;
      continue;
    end if;

    select exists (
      select 1 from public.automation_run_events e
      where e.automation_id=r.automation_id
        and e.created_at between r.slot_at - interval '10 minutes' and r.slot_at + interval '45 minutes'
        and (e.stage in ('published','success','skipped_reserved_hour') or (e.stage='failed' and e.status='failed'))
    ) into v_has_terminal;

    if not v_has_terminal and r.slot_at <= v_now - interval '30 minutes' then
      insert into public.automation_watchdog_alerts(automation_id,automation_title,slot_at,issue_type,details)
      values(r.automation_id,r.automation_title,r.slot_at,'run_stalled',jsonb_build_object('grace_minutes',30))
      on conflict (automation_id,slot_at,issue_type) do nothing;
    end if;
  end loop;

  update public.automation_watchdog_alerts a
     set state='resolved', resolved_at=coalesce(resolved_at,v_now)
   where state='open' and issue_type='scheduler_missed'
     and exists (
       select 1 from public.automation_run_events e
       where e.automation_id=a.automation_id and e.stage='start'
         and e.created_at between a.slot_at - interval '10 minutes' and a.slot_at + interval '60 minutes'
     );

  update public.automation_watchdog_alerts a
     set state='resolved', resolved_at=coalesce(resolved_at,v_now)
   where state='open' and issue_type='run_stalled'
     and exists (
       select 1 from public.automation_run_events e
       where e.automation_id=a.automation_id
         and e.created_at between a.slot_at - interval '10 minutes' and a.slot_at + interval '90 minutes'
         and (e.stage in ('published','skipped_reserved_hour','success') or (e.stage='failed' and e.status='failed'))
     );

  -- Historical verification warnings are obsolete under the fail-open policy.
  update public.automation_watchdog_alerts
     set state='resolved', resolved_at=coalesce(resolved_at,v_now)
   where state='open' and issue_type='verification_warning';
end;
$$;

update public.site_settings
set value = jsonb_set(
  jsonb_set(value, '{checks}',
    '["spelling_and_grammar","duplicate_paragraphs","prompt_or_editorial_instruction_leakage","editorial_rule_violations","source_metadata_when_sources_exist","no_ordinary_body_hyperlinks","hero_presence_and_basic_metadata","headline_deck_body_consistency"]'::jsonb,
    true
  ),
  '{source_list_rendering}', '"rendered_separately_from_source_metadata"'::jsonb, true
), updated_at = now()
where key = 'prepublication_qa_policy';
