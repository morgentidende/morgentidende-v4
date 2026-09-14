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

type ManualUploadJob = {
  id: string;
  article_id: string;
  token_hash: string;
  payload_base64: string | null;
  mime_type: string;
  file_name: string | null;
  metadata: Record<string, unknown>;
  status: 'pending' | 'processing' | 'done' | 'failed' | 'expired';
  expires_at: string;
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

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
});

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer))
  .map((byte) => byte.toString(16).padStart(2, '0'))
  .join('');

const sha256Text = async (value: string) => hex(await crypto.subtle.digest(
  'SHA-256',
  new TextEncoder().encode(value),
));

const base64ToBytes = (value: string) => {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i += 1) bytes[i] = decoded.charCodeAt(i);
  return bytes;
};

const sha256Bytes = async (bytes: Uint8Array) => hex(await crypto.subtle.digest('SHA-256', bytes));

const getManualUploadIntegrity = (metadata: Record<string, unknown>) => {
  const expectedByteSize = Number(metadata.expected_byte_size);
  const expectedSha256 = typeof metadata.expected_sha256 === 'string'
    ? metadata.expected_sha256.trim().toLowerCase()
    : '';

  if (!Number.isSafeInteger(expectedByteSize) || expectedByteSize <= 0) return null;
  if (!/^[0-9a-f]{64}$/.test(expectedSha256)) return null;

  return { expectedByteSize, expectedSha256 };
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

const patchManualUploadJob = async (env: Env, id: string, patch: Record<string, unknown>) => {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/manual_chat_media_upload_jobs?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: supabaseHeaders(env, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`manual_upload_patch_failed:${response.status}`);
};

const getManualUploadJob = async (env: Env, id: string): Promise<ManualUploadJob | null> => {
  const params = new URLSearchParams({
    id: `eq.${id}`,
    select: 'id,article_id,token_hash,payload_base64,mime_type,file_name,metadata,status,expires_at',
    limit: '1',
  });
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/manual_chat_media_upload_jobs?${params.toString()}`, {
    headers: supabaseHeaders(env),
  });
  if (!response.ok) throw new Error(`manual_upload_lookup_failed:${response.status}`);
  const rows = await response.json<ManualUploadJob[]>();
  return rows[0] || null;
};

const handleManualUpload = async (request: Request, env: Env, jobId: string): Promise<Response> => {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  if (!token || token.length < 32) return json({ error: 'manual_upload_token_required' }, 401);

  const job = await getManualUploadJob(env, jobId);
  if (!job) return json({ error: 'manual_upload_job_not_found' }, 404);

  if (new Date(job.expires_at).getTime() <= Date.now()) {
    if (job.status === 'pending') await patchManualUploadJob(env, job.id, { status: 'expired' });
    return json({ error: 'manual_upload_job_expired' }, 410);
  }

  const tokenHash = await sha256Text(token);
  if (tokenHash !== job.token_hash) return json({ error: 'manual_upload_unauthorized' }, 401);

  if (job.status === 'done') return json({ ok: true, already_done: true });
  if (job.status === 'processing') return json({ error: 'manual_upload_in_progress' }, 409);
  if (job.status !== 'pending' && job.status !== 'failed') {
    return json({ error: `manual_upload_${job.status}` }, 409);
  }
  if (!job.payload_base64) return json({ error: 'manual_upload_payload_missing' }, 422);

  const integrity = getManualUploadIntegrity(job.metadata || {});
  if (!integrity) {
    await patchManualUploadJob(env, job.id, {
      status: 'failed',
      last_error: 'manual_upload_integrity_metadata_required',
    });
    return json({ error: 'manual_upload_integrity_metadata_required' }, 422);
  }

  await patchManualUploadJob(env, job.id, { status: 'processing', last_error: null });

  try {
    const bytes = base64ToBytes(job.payload_base64);
    const actualSha256 = await sha256Bytes(bytes);

    if (bytes.byteLength !== integrity.expectedByteSize || actualSha256 !== integrity.expectedSha256) {
      const detail = {
        expected_byte_size: integrity.expectedByteSize,
        actual_byte_size: bytes.byteLength,
        expected_sha256: integrity.expectedSha256,
        actual_sha256: actualSha256,
      };
      await patchManualUploadJob(env, job.id, {
        status: 'failed',
        result: { integrity_error: detail },
        last_error: 'manual_upload_integrity_mismatch',
      });
      return json({ error: 'manual_upload_integrity_mismatch', ...detail }, 422);
    }

    const file = new File([bytes], job.file_name || 'generated-hero', { type: job.mime_type });
    const metadata = {
      ...(job.metadata || {}),
      article_id: job.article_id,
      source_provider: 'openai_image_generation',
      commercial_use_allowed: true,
      local_storage_allowed: true,
      modifications_allowed: true,
      attribution_required: false,
      metadata: {
        ...((job.metadata?.metadata as Record<string, unknown> | undefined) || {}),
        ingest_mode: 'manual_chat_bridge',
        manual_upload_job_id: job.id,
        source_integrity_sha256: actualSha256,
        source_integrity_byte_size: bytes.byteLength,
      },
    };

    const form = new FormData();
    form.set('file', file);
    form.set('metadata', JSON.stringify(metadata));

    const response = await worker.fetch(new Request('https://internal/upload', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.MEDIA_INGEST_TOKEN}` },
      body: form,
    }), env);

    const text = await response.text();
    let result: Record<string, unknown> = {};
    try {
      result = JSON.parse(text) as Record<string, unknown>;
    } catch {
      result = { raw: text.slice(0, 500) };
    }

    if (!response.ok) {
      await patchManualUploadJob(env, job.id, {
        status: 'failed',
        result,
        last_error: `upload_${response.status}:${JSON.stringify(result).slice(0, 500)}`,
      });
      return json({ ok: false, error: 'manual_upload_failed', upstream_status: response.status, result }, 502);
    }

    const asset = result.asset as { id?: string; delivery_url?: string; sha256?: string } | undefined;
    if (!asset?.id || !asset.delivery_url || asset.sha256 !== integrity.expectedSha256) {
      await patchManualUploadJob(env, job.id, {
        status: 'failed',
        result,
        last_error: 'manual_upload_upstream_integrity_mismatch',
      });
      return json({ error: 'manual_upload_upstream_integrity_mismatch' }, 502);
    }

    await patchManualUploadJob(env, job.id, {
      status: 'done',
      asset_id: asset.id,
      result,
      last_error: null,
      payload_base64: null,
      consumed_at: new Date().toISOString(),
    });

    return json({
      ok: true,
      asset_id: asset.id,
      delivery_url: asset.delivery_url,
      deduplicated: Boolean(result.deduplicated),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_manual_upload_error';
    await patchManualUploadJob(env, job.id, {
      status: 'failed',
      last_error: message.slice(0, 500),
    });
    console.error('manual_chat_media_upload_error', { job_id: job.id, error: message });
    return json({ error: 'manual_upload_internal_error' }, 500);
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
    const manualMatch = url.pathname.match(/^\/manual-upload\/([0-9a-f-]{36})$/i);
    if (request.method === 'GET' && manualMatch) {
      return handleManualUpload(request, env, manualMatch[1]);
    }
    if (request.method === 'POST' && url.pathname === '/ingest') {
      return handleFastIngest(request, env);
    }
    return worker.fetch(request, env);
  },

  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(processQueue(env));
  },
};
