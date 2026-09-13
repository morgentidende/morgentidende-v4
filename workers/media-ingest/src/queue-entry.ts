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

type ErrorBody = {
  error?: string;
  status?: number;
};

const supabaseHeaders = (env: Env, extra: Record<string, string> = {}) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'content-type': 'application/json',
  ...extra,
});

const retryAt = (attempts: number) => {
  const minutes = Math.min(120, Math.max(1, attempts) * 30);
  return new Date(Date.now() + minutes * 60_000).toISOString();
};

const patchJob = async (env: Env, id: string, patch: Record<string, unknown>) => {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/media_ingest_jobs?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: supabaseHeaders(env, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`queue_patch_failed:${response.status}`);
};

const enqueueFallback = async (
  env: Env,
  payload: Record<string, unknown>,
  failure: ErrorBody,
): Promise<string> => {
  const articleId = typeof payload.article_id === 'string' ? payload.article_id : null;
  const { article_id: _articleId, ...jobPayload } = payload;

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/media_ingest_jobs?select=id`, {
    method: 'POST',
    headers: supabaseHeaders(env, { Prefer: 'return=representation' }),
    body: JSON.stringify({
      article_id: articleId,
      payload: jobPayload,
      result: { queued_after_fast_path_failure: failure },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`queue_insert_failed:${response.status}:${detail.slice(0, 300)}`);
  }

  const rows = await response.json<Array<{ id: string }>>();
  if (!rows[0]?.id) throw new Error('queue_insert_returned_no_job');
  return rows[0].id;
};

const claimJobs = async (env: Env): Promise<QueueJob[]> => {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/claim_media_ingest_jobs`, {
    method: 'POST',
    headers: supabaseHeaders(env),
    body: JSON.stringify({ job_limit: 10 }),
  });
  if (!response.ok) throw new Error(`queue_claim_failed:${response.status}`);
  return response.json<QueueJob[]>();
};

const parseErrorBody = async (response: Response): Promise<ErrorBody> => {
  try {
    return await response.clone().json<ErrorBody>();
  } catch {
    return {};
  }
};

const isTransientIngestFailure = (response: Response, body: ErrorBody) => {
  if (response.status >= 500) return true;
  if (body.error !== 'source_fetch_failed') return false;

  const upstreamStatus = Number(body.status || 0);
  return upstreamStatus === 408
    || upstreamStatus === 425
    || upstreamStatus === 429
    || upstreamStatus >= 500;
};

const handleFastIngest = async (request: Request, env: Env): Promise<Response> => {
  let payload: Record<string, unknown>;
  try {
    payload = await request.clone().json<Record<string, unknown>>();
  } catch {
    return worker.fetch(request, env);
  }

  const response = await worker.fetch(request, env);
  if (response.ok) return response;

  const failure = await parseErrorBody(response);
  if (!isTransientIngestFailure(response, failure)) return response;

  try {
    const jobId = await enqueueFallback(env, payload, failure);
    return new Response(JSON.stringify({
      ok: false,
      queued: true,
      job_id: jobId,
      reason: failure.error || `ingest_${response.status}`,
    }), {
      status: 202,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    console.error('media_fallback_queue_error', error);
    return response;
  }
};

const processJob = async (env: Env, job: QueueJob) => {
  const payload = {
    ...job.payload,
    ...(job.article_id ? { article_id: job.article_id } : {}),
  };

  // Queue retries deliberately call the core worker directly. This prevents a
  // failed retry from recursively creating another fallback job.
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
  await patchJob(env, job.id, {
    status: terminal ? 'failed' : 'pending',
    next_attempt_at: retryAt(job.attempts),
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
        next_attempt_at: retryAt(job.attempts),
        last_error: message.slice(0, 500),
      });
      console.error('media_queue_job_error', { job_id: job.id, error: message });
    }
  }
};

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/ingest') {
      return handleFastIngest(request, env);
    }
    return worker.fetch(request, env);
  },

  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(processQueue(env));
  },
};
