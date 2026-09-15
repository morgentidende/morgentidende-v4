create or replace function public.check_livecenter_editorial_watchdog(
  p_stale_after_minutes integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_center record;
  v_last_update timestamptz;
  v_last_slot_key text;
  v_anchor timestamptz;
  v_automation_id text;
  v_outcomes jsonb := '[]'::jsonb;
begin
  if p_stale_after_minutes < 30 or p_stale_after_minutes > 1440 then
    raise exception 'invalid stale interval';
  end if;

  for v_center in
    select id, slug, title, starts_at, ends_at, cadence
    from public.live_centers
    where homepage_active = true
      and status in ('live', 'scheduled')
      and starts_at <= v_now
      and (ends_at is null or ends_at > v_now)
      and lower(coalesce(cadence->>'editorial', cadence->>'editorial_cadence', '')) in ('hourly', '1h')
  loop
    select u.published_at, u.automation_slot_key
      into v_last_update, v_last_slot_key
    from public.live_updates u
    where u.live_center_id = v_center.id
    order by u.published_at desc
    limit 1;

    v_anchor := coalesce(v_last_update, v_center.starts_at);
    v_automation_id := 'livecenter:' || v_center.slug;

    if v_anchor >= v_now - make_interval(mins => p_stale_after_minutes) then
      update public.automation_watchdog_alerts
      set state = 'resolved', resolved_at = v_now
      where automation_id = v_automation_id
        and issue_type = 'run_stalled'
        and state = 'open'
        and details->>'subtype' = 'livecenter_editorial_stale';

      v_outcomes := v_outcomes || jsonb_build_array(jsonb_build_object(
        'slug', v_center.slug,
        'status', 'ok',
        'last_update_at', v_last_update
      ));
    else
      insert into public.automation_watchdog_alerts (
        automation_id,
        automation_title,
        slot_at,
        issue_type,
        state,
        details,
        detected_at
      ) values (
        v_automation_id,
        'Livecenter editorial: ' || coalesce(v_center.title, v_center.slug),
        v_anchor,
        'run_stalled',
        'open',
        jsonb_build_object(
          'subtype', 'livecenter_editorial_stale',
          'live_center_id', v_center.id,
          'slug', v_center.slug,
          'stale_after_minutes', p_stale_after_minutes,
          'last_update_at', v_last_update,
          'last_automation_slot_key', v_last_slot_key
        ),
        v_now
      )
      on conflict (automation_id, slot_at, issue_type) do nothing;

      v_outcomes := v_outcomes || jsonb_build_array(jsonb_build_object(
        'slug', v_center.slug,
        'status', 'stale',
        'last_update_at', v_last_update
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'checked_at', v_now,
    'centers_checked', jsonb_array_length(v_outcomes),
    'outcomes', v_outcomes
  );
end;
$$;

revoke all on function public.check_livecenter_editorial_watchdog(integer) from public, anon, authenticated;
grant execute on function public.check_livecenter_editorial_watchdog(integer) to service_role;
