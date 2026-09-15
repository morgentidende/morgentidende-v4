interface LivecenterEditorialWatchdogEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export async function checkLivecenterEditorialCadence(
  env: LivecenterEditorialWatchdogEnv,
  staleAfterMinutes = 90,
) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Livecenter editorial watchdog missing Supabase bindings');
  }

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/check_livecenter_editorial_watchdog`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_stale_after_minutes: staleAfterMinutes }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`livecenter editorial watchdog RPC ${response.status}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : { checked_at: new Date().toISOString(), centers_checked: 0, outcomes: [] };
}
