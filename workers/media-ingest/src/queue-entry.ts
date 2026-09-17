import worker from './index';
import {
  isWikimediaCommonsPayload,
  resolveWikimediaCommonsPayload,
} from './wikimedia-commons-resolver';

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

type AttemptResult = {
  response: Response;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
};

const jsonResponse = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
});

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

const markArticleMediaTerminal = async (
  env: Env,
  job: QueueJob,
  reason: string,
  details: Record<string, unknown>,
) => {
  if (!job.article_id) return;
  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/mark_article_media_terminal_failure`, {
      method: 'POST',
      headers: supabaseHeaders(env),
      body: JSON.stringify({
        p_job_id: job.id,
        p_reason: reason.slice(0, 500),
        p_details: details,
      }),
    });
    if (!response.ok) {
      console.error('media_terminal_article_state_failed', {
        job_id: job.id,
        article_id: job.article_id,
        status: response.status,
        body: (await response.text()).slice(0, 300),
      });
    }
  } catch (error) {
    console.error('media_terminal_article_state_failed', {
      job_id: job.id,
      article_id: job.article_id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
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

const isTransientIngestFailure = (response: Response, body: ErrorBody) => {
  if (response.status >= 500) return true;
  if (body.error !== 'source_fetch_failed') return false;

  const upstreamStatus = Number(body.status || 0);
  return upstreamStatus === 408
    || upstreamStatus === 425
    || upstreamStatus === 429
    || upstreamStatus >= 500;
};

const invokeInternalIngest = (env: Env, payload: Record<string, unknown>) => worker.fetch(new Request('https://internal/ingest', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${env.MEDIA_INGEST_TOKEN}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify(payload),
}), env);

const resolveBeforeIngest = async (payload: Record<string, unknown>): Promise<{
  payload: Record<string, unknown>;
  response?: Response;
}> => {
  if (!isWikimediaCommonsPayload(payload)) return { payload };

  const resolved = await resolveWikimediaCommonsPayload(payload);
  if (resolved.kind === 'transient') {
    return {
      payload,
      response: jsonResponse({ error: resolved.error, status: resolved.status || null }, 503),
    };
  }
  if (resolved.kind === 'permanent') {
    return {
      payload,
      response: jsonResponse({ error: resolved.error, ...(resolved.detail || {}) }, 422),
    };
  }
  return { payload: resolved.payload };
};

const attemptIngest = async (env: Env, payload: Record<string, unknown>): Promise<AttemptResult> => {
  const prepared = await resolveBeforeIngest(payload);
  if (prepared.response) {
    return {
      response: prepared.response,
      payload: prepared.payload,
      result: await parseJsonRecord(prepared.response.clone()),
    };
  }

  const response = await invokeInternalIngest(env, prepared.payload);
  return {
    response,
    payload: prepared.payload,
    result: await parseJsonRecord(response.clone()),
  };
};

const withoutArticleId = (payload: Record<string, unknown>) => {
  const { article_id: _articleId, ...jobPayload } = payload;
  return jobPayload;
};

const arrayOfRecords = (value: unknown): Record<string, unknown>[] => Array.isArray(value)
  ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
  : [];

const candidateIndex = (payload: Record<string, unknown>) => {
  const value = Number(payload.candidate_index ?? 0);
  return Number.isInteger(value) && value >= 0 ? value : 0;
};

const recordAttempt = (
  payload: Record<string, unknown>,
  result: Record<string, unknown>,
  response: Response,
) => {
  const tried = arrayOfRecords(payload.tried).slice(-10);
  tried.push({
    candidate_index: candidateIndex(payload),
    source_url: typeof payload.source_url === 'string' ? payload.source_url : null,
    resolved_url: typeof payload.source_url === 'string' ? payload.source_url : null,
    http_status: response.status,
    error: typeof result.error === 'string' ? result.error : null,
    upstream_status: typeof result.status === 'number' ? result.status : null,
    at: new Date().toISOString(),
  });
  return tried;
};

const cleanMetadataForNextCandidate = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const metadata = { ...(value as Record<string, unknown>) };
  for (const key of [
    'commons_identity',
    'commons_expected_sha1',
    'commons_license_snapshot',
    'commons_resolved_at',
    'media_candidate_index',
    'fallback_advanced_at',
    'fallback_from_source_url',
    'fallback_reason',
    'fallback_hop',
  ]) delete metadata[key];
  return metadata;
};

const nextCandidatePayload = (
  current: Record<string, unknown>,
  tried: Record<string, unknown>[],
): Record<string, unknown> | null => {
  const fallbacks = arrayOfRecords(current.fallback_candidates);
  const nextIndex = candidateIndex(current) + 1;
  const sharedMetadata = cleanMetadataForNextCandidate(current.metadata);

  while (fallbacks.length > 0) {
    const next = fallbacks.shift()!;
    if (typeof next.source_url !== 'string' || !next.source_url.trim()) continue;
    if (next.commercial_use_allowed !== true || next.local_storage_allowed !== true) continue;
    const nextMetadata = next.metadata && typeof next.metadata === 'object' && !Array.isArray(next.metadata)
      ? next.metadata as Record<string, unknown>
      : {};

    return {
      ...next,
      fallback_candidates: fallbacks,
      candidate_index: nextIndex,
      tried,
      metadata: {
        ...sharedMetadata,
        ...nextMetadata,
        media_candidate_index: nextIndex,
        fallback_advanced_at: new Date().toISOString(),
      },
    };
  }
  return null;
};

const handleFastIngest = async (request: Request, env: Env): Promise<Response> => {
  let payload: Record<string, unknown>;
  try {
    payload = await request.clone().json<Record<string, unknown>>();
  } catch {
    return worker.fetch(request, env);
  }

  let current = payload;
  for (let guard = 0; guard < 7; guard += 1) {
    const attempt = await attemptIngest(env, current);
    if (attempt.response.ok) return attempt.response;

    const tried = recordAttempt(attempt.payload, attempt.result, attempt.response);
    const transient = isTransientIngestFailure(attempt.response, attempt.result as ErrorBody);

    if (transient) {
      const failure: ErrorBody = {
        ...(attempt.result as ErrorBody),
        http_status: attempt.response.status,
      };
      try {
        const jobId = await enqueueFallback(env, { ...attempt.payload, tried }, failure);
        return jsonResponse({
          ok: false,
          queued: true,
          job_id: jobId,
          reason: failure.error || `ingest_${attempt.response.status}`,
        }, 202);
      } catch (error) {
        console.error('media_fallback_queue_error', error);
        return attempt.response;
      }
    }

    const next = nextCandidatePayload(attempt.payload, tried);
    if (!next) return attempt.response;
    current = next;
  }

  return jsonResponse({ error: 'hero_fallback_limit_reached' }, 422);
};

const processJob = async (env: Env, job: QueueJob) => {
  let payload: Record<string, unknown> = {
    ...job.payload,
    candidate_index: candidateIndex(job.payload),
  };

  for (let guard = 0; guard < 8; guard += 1) {
    const ingestPayload = {
      ...payload,
      ...(job.article_id ? { article_id: job.article_id } : {}),
    };
    const attempt = await attemptIngest(env, ingestPayload);
    payload = withoutArticleId(attempt.payload);

    if (attempt.response.ok) {
      const asset = attempt.result.asset as { id?: string } | undefined;
      await patchJob(env, job.id, {
        status: 'done',
        payload,
        asset_id: asset?.id || null,
        result: {
          ...attempt.result,
          candidate_index: candidateIndex(payload),
          resolved_url: typeof payload.source_url === 'string' ? payload.source_url : null,
          tried: arrayOfRecords(payload.tried),
        },
        last_error: null,
        next_attempt_at: null,
      });
      return;
    }

    const tried = recordAttempt(payload, attempt.result, attempt.response);
    payload = { ...payload, tried };
    const transient = isTransientIngestFailure(attempt.response, attempt.result as ErrorBody);

    if (transient) {
      const terminal = job.attempts >= 3;
      const lastError = `ingest_${attempt.response.status}:${JSON.stringify(attempt.result).slice(0, 500)}`;
      const result = {
        ...attempt.result,
        failure_class: 'transient',
        terminal,
        candidate_index: candidateIndex(payload),
        tried,
      };
      await patchJob(env, job.id, {
        status: terminal ? 'failed' : 'pending',
        payload,
        next_attempt_at: terminal ? null : retryAt(job.attempts),
        last_error: lastError,
        result,
      });
      if (terminal) await markArticleMediaTerminal(env, job, lastError, result);
      return;
    }

    const next = nextCandidatePayload(payload, tried);
    if (next) {
      payload = next;
      continue;
    }

    const lastError = `ingest_${attempt.response.status}:${JSON.stringify(attempt.result).slice(0, 500)}`;
    const result = {
      ...attempt.result,
      failure_class: 'permanent',
      terminal: true,
      candidate_index: candidateIndex(payload),
      candidates_exhausted: true,
      tried,
    };
    await patchJob(env, job.id, {
      status: 'failed',
      payload,
      next_attempt_at: null,
      last_error: lastError,
      result,
    });
    await markArticleMediaTerminal(env, job, lastError, result);
    return;
  }

  const result = {
    error: 'candidate_loop_guard_exhausted',
    terminal: true,
    candidate_index: candidateIndex(payload),
    tried: arrayOfRecords(payload.tried),
  };
  await patchJob(env, job.id, {
    status: 'failed',
    payload,
    next_attempt_at: null,
    last_error: 'candidate_loop_guard_exhausted',
    result,
  });
  await markArticleMediaTerminal(env, job, 'candidate_loop_guard_exhausted', result);
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
        next_attempt_at: terminal ? null : retryAt(job.attempts),
        last_error: message.slice(0, 500),
        ...(terminal ? { result: { error: message.slice(0, 500), terminal: true, failure_class: 'worker_error' } } : {}),
      });
      if (terminal) {
        await markArticleMediaTerminal(env, job, message, { failure_class: 'worker_error', terminal: true });
      }
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
