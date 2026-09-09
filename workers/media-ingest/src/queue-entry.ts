import worker from './index';

interface Env {
  MEDIA_BUCKET: R2Bucket;
  MEDIA_PUBLIC_BASE_URL: string;
  MEDIA_MAX_BYTES?: string;
  MEDIA_INGEST_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

type QueueJob = {
  id: string;
  article_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
};

const supabaseHeaders = (env: Env, extra: Record<string, string> = {}) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'content-type': 'application/json',
  ...extra,
});

const patchJob = async (env: Env, id: string, patch: Record<string, unknown>) => {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/media_ingest_jobs?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: supabaseHeaders(env, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`queue_patch_failed:${response.status}`);
};

const claimJobs = async (env: Env): Promise<QueueJob[]> => {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/claim_media_ingest_jobs`, {
    method: 'POST',
    headers: supabaseHeaders(env),
    body: JSON.stringify({ job_limit: 5 }),
  });
  if (!response.ok) throw new Error(`queue_claim_failed:${response.status}`);
  return response.json<QueueJob[]>();
};

const processJob = async (env: Env, job: QueueJob) => {
  const payload = {
    ...job.payload,
    ...(job.article_id ? { article_id: job.article_id } : {}),
  };

  const response = await worker.fetch(new Request('https://internal/ingest', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.MEDIA_INGEST_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  }), env);

  const text = await response.text();
  let result: Record<string, unknown> = {};
  try {
    result = JSON.parse(text) as Record<string, unknown>;
  } catch {
    result = { raw: text.slice(0, 500) };
  }

  if (response.ok) {
    const asset = result.asset as { id?: string } | undefined;
    await patchJob(env, job.id, {
      status: 'done',
      asset_id: asset?.id || null,
      result,
      last_error: null,
    });
    return;
  }

  const terminal = job.attempts >= 3;
  const retryAt = new Date(Date.now() + Math.max(5, job.attempts * 5) * 60_000).toISOString();
  await patchJob(env, job.id, {
    status: terminal ? 'failed' : 'pending',
    next_attempt_at: retryAt,
    last_error: `ingest_${response.status}:${JSON.stringify(result).slice(0, 500)}`,
    result,
  });
};

const processQueue = async (env: Env) => {
  const jobs = await claimJobs(env);
  for (const job of jobs) {
    try {
      await processJob(env, job);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_queue_error';
      const terminal = job.attempts >= 3;
      await patchJob(env, job.id, {
        status: terminal ? 'failed' : 'pending',
        next_attempt_at: new Date(Date.now() + Math.max(5, job.attempts * 5) * 60_000).toISOString(),
        last_error: message.slice(0, 500),
      });
      console.error('media_queue_job_error', { job_id: job.id, error: message });
    }
  }
};

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return worker.fetch(request, env);
  },

  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(processQueue(env));
  },
};
