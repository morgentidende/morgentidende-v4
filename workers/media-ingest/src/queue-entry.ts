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
  http_status?: number;
};

const supabaseHeaders = (env: Env, extra: Record<string, string> = {}) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'content-type': 'application/json',
  ...extra,
});

const parseJsonRecord = async <T extends Record<string, unknown> = Record<string, unknown>>(
  response: Response,
): Promise<T> => {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return { raw: text.slice(0, 500) } as T;
  }
};

const retryAt = (attempts: number) => {
  const retryMinutes = [4, 12, 30];
  const index = Math.max(0, Math.min(retryMinutes.length - 1, attempts - 1));
  return new Date(Date.now() + retryMinutes[index] * 60_000).toISOString();
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

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/enqueue_media_ingest_fallback`, {
    method: 'POST',
    headers: supabaseHeaders(env),
    body: JSON.stringify({
      p_article_id: articleId,
      p_payload: jobPayload,
      p_failure: failure,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`queue_fallback_rpc_failed:${response.status}:${detail.slice(0, 300)}`);
  }

  const jobId = await response.json<string>();
  if (!jobId) throw new Error('queue_fallback_rpc_returned_no_job');
  return jobId;
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

  const parsedFailure = await parseErrorBody(response);
  if (!isTransientIngestFailure(response, parsedFailure)) return response;

  const failure: ErrorBody = {
    ...parsedFailure,
    http_status: response.status,
  };

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

  const response = await worker.fetch(new Request('https://internal/ingest', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.MEDIA_INGEST_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  }), env);
  const result = await parseJsonRecord(response);

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
