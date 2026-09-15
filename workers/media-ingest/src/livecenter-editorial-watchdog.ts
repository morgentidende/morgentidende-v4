interface LivecenterEditorialWatchdogEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

type Json = Record<string, any>;

const headers = (env: LivecenterEditorialWatchdogEnv, prefer?: string) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'content-type': 'application/json',
  ...(prefer ? { Prefer: prefer } : {}),
});

async function readJson(env: LivecenterEditorialWatchdogEnv, path: string) {
  const response = await fetch(`${env.SUPABASE_URL}${path}`, { headers: headers(env) });
  const text = await response.text();
  if (!response.ok) throw new Error(`livecenter editorial watchdog read ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function writeAlert(env: LivecenterEditorialWatchdogEnv, row: Json) {
  const conflict = 'automation_id,slot_at,issue_type';
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/automation_watchdog_alerts?on_conflict=${encodeURIComponent(conflict)}`,
    {
      method: 'POST',
      headers: headers(env, 'resolution=ignore-duplicates,return=minimal'),
      body: JSON.stringify(row),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`livecenter editorial watchdog alert ${response.status}: ${text.slice(0, 300)}`);
  }
}

async function resolveAlerts(env: LivecenterEditorialWatchdogEnv, automationId: string) {
  const query = new URLSearchParams({
    automation_id: `eq.${automationId}`,
    issue_type: 'eq.livecenter_editorial_stale',
    state: 'eq.open',
  });
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/automation_watchdog_alerts?${query.toString()}`, {
    method: 'PATCH',
    headers: headers(env, 'return=minimal'),
    body: JSON.stringify({ state: 'resolved', resolved_at: new Date().toISOString() }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`livecenter editorial watchdog resolve ${response.status}: ${text.slice(0, 300)}`);
  }
}

const isHourlyEditorial = (center: Json) => {
  const cadence = center?.cadence || {};
  const value = String(cadence.editorial || cadence.editorial_cadence || '').toLowerCase();
  return value === 'hourly' || value === '1h' || Number(cadence.editorial_minutes) === 60;
};

export async function checkLivecenterEditorialCadence(
  env: LivecenterEditorialWatchdogEnv,
  staleAfterMinutes = 90,
) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Livecenter editorial watchdog missing Supabase bindings');
  }

  const select = ['id','slug','title','status','homepage_active','starts_at','ends_at','cadence'].join(',');
  const centers: Json[] = await readJson(
    env,
    `/rest/v1/live_centers?homepage_active=eq.true&status=in.(live,scheduled)&select=${encodeURIComponent(select)}`,
  ) || [];

  const now = Date.now();
  const thresholdMs = staleAfterMinutes * 60 * 1000;
  const outcomes: Json[] = [];

  for (const center of centers.filter(isHourlyEditorial)) {
    const startsAt = Date.parse(center.starts_at || '');
    const endsAt = center.ends_at ? Date.parse(center.ends_at) : Number.POSITIVE_INFINITY;
    if ((Number.isFinite(startsAt) && startsAt > now) || (Number.isFinite(endsAt) && endsAt <= now)) continue;

    const updates: Json[] = await readJson(
      env,
      `/rest/v1/live_updates?live_center_id=eq.${encodeURIComponent(center.id)}&select=published_at,automation_slot_key&order=published_at.desc&limit=1`,
    ) || [];
    const last = updates[0] || null;
    const anchor = last?.published_at || center.starts_at;
    const anchorMs = Date.parse(anchor || '');
    const ageMs = Number.isFinite(anchorMs) ? now - anchorMs : Number.POSITIVE_INFINITY;
    const automationId = `livecenter:${center.slug}`;

    if (ageMs <= thresholdMs) {
      await resolveAlerts(env, automationId);
      outcomes.push({ slug: center.slug, status: 'ok', last_update_at: last?.published_at || null });
      continue;
    }

    const slotAt = new Date(Number.isFinite(anchorMs) ? anchorMs : now).toISOString();
    await writeAlert(env, {
      automation_id: automationId,
      automation_title: `Livecenter editorial: ${center.title || center.slug}`,
      slot_at: slotAt,
      issue_type: 'livecenter_editorial_stale',
      state: 'open',
      details: {
        live_center_id: center.id,
        slug: center.slug,
        stale_after_minutes: staleAfterMinutes,
        last_update_at: last?.published_at || null,
        last_automation_slot_key: last?.automation_slot_key || null,
      },
      detected_at: new Date().toISOString(),
    });
    outcomes.push({ slug: center.slug, status: 'stale', last_update_at: last?.published_at || null });
  }

  return { checked_at: new Date().toISOString(), centers_checked: outcomes.length, outcomes };
}
