interface LivecenterMetricsObservabilityEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const headers = (env: LivecenterMetricsObservabilityEnv) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'content-type': 'application/json',
  Prefer: 'return=minimal',
});

export async function recordLivecenterMetricPoll(
  env: LivecenterMetricsObservabilityEnv,
  payload: { started_at: string; completed_at: string; centers_due?: number; outcomes?: unknown; error?: string | null },
) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/live_metric_poll_runs`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify({
      started_at: payload.started_at,
      completed_at: payload.completed_at,
      centers_due: Number.isInteger(payload.centers_due) ? payload.centers_due : null,
      outcomes: Array.isArray(payload.outcomes) ? payload.outcomes : [],
      error: payload.error || null,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    console.error('livecenter_metrics_observability_failed', response.status, text.slice(0, 300));
  }
}
