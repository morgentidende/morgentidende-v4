import {
  type BaseWorker,
  type ManualJob,
  type ManualUploadEnv as Env,
  expectedIntegrity,
  getManualUploadJob,
  integrityMismatchDetail,
  manualUploadHeaders as headers,
  manualUploadJson as json,
  patchManualUploadJob,
  sha256Bytes,
  sha256Text,
  uploadGeneratedHero,
} from './manual-chat-upload-shared';

const getJob = (env: Env, id: string) => getManualUploadJob(env, id, 'dropbox_upload');
const patchJob = (env: Env, id: string, patch: Record<string, unknown>) => (
  patchManualUploadJob(env, id, patch, 'dropbox_upload')
);

const listPendingDropboxJobs = async (env: Env, limit = 5): Promise<ManualJob[]> => {
  const params = new URLSearchParams({
    status: 'eq.pending',
    'metadata->>transport_provider': 'eq.dropbox',
    'metadata->>dropbox_download_url': 'not.is.null',
    select: 'id,article_id,token_hash,mime_type,file_name,metadata,status,expires_at',
    order: 'created_at.asc',
    limit: String(limit),
  });
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/manual_chat_media_upload_jobs?${params}`, {
    headers: headers(env),
  });
  if (!response.ok) throw new Error(`dropbox_upload_list_failed:${response.status}`);
  return response.json<ManualJob[]>();
};

const claimJob = async (env: Env, job: ManualJob) => {
  if (!['pending', 'failed'].includes(job.status)) return false;
  const params = new URLSearchParams({ id: `eq.${job.id}`, status: `eq.${job.status}` });
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/manual_chat_media_upload_jobs?${params}`, {
    method: 'PATCH',
    headers: headers(env, { Prefer: 'return=representation' }),
    body: JSON.stringify({ status: 'processing', last_error: null, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`dropbox_upload_claim_failed:${response.status}`);
  const rows = await response.json<ManualJob[]>();
  return rows.length === 1;
};

const isAllowedDropboxUrl = (raw: string) => {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && (url.hostname === 'dropboxusercontent.com' || url.hostname.endsWith('.dropboxusercontent.com'));
  } catch {
    return false;
  }
};

const cleanedJobMetadata = (job: ManualJob) => {
  const { dropbox_download_url: _dropboxDownloadUrl, source_url: _sourceUrl, ...rest } = job.metadata || {};
  return rest;
};

const processDropboxJob = async (
  job: ManualJob,
  sourceUrl: string,
  env: Env,
  baseWorker: BaseWorker,
  alreadyClaimed = false,
): Promise<Response> => {
  if (new Date(job.expires_at).getTime() <= Date.now()) {
    if (job.status === 'pending') await patchJob(env, job.id, { status: 'expired' });
    return json({ error: 'manual_upload_job_expired' }, 410);
  }
  if (!['pending', 'failed'].includes(job.status)) return json({ error: `manual_upload_${job.status}` }, 409);
  if (!isAllowedDropboxUrl(sourceUrl)) return json({ error: 'manual_upload_dropbox_url_required' }, 422);

  const expected = expectedIntegrity(job.metadata || {});
  if (!expected) return json({ error: 'manual_upload_integrity_metadata_required' }, 422);

  if (!alreadyClaimed && !(await claimJob(env, job))) {
    return json({ error: 'manual_upload_in_progress' }, 409);
  }

  try {
    // Dropbox temporary download URLs are single-use: perform exactly one GET.
    const source = await fetch(sourceUrl, { method: 'GET', redirect: 'follow' });
    if (!source.ok) throw new Error(`dropbox_fetch_failed:${source.status}`);

    const responseType = (source.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const expectedType = job.mime_type.toLowerCase();
    if (responseType && responseType !== 'application/octet-stream' && responseType !== expectedType) {
      throw new Error(`dropbox_mime_mismatch:${responseType}`);
    }

    const bytes = new Uint8Array(await source.arrayBuffer());
    const actualSha256 = await sha256Bytes(bytes);
    if (bytes.byteLength !== expected.expectedByteSize || actualSha256 !== expected.expectedSha256) {
      const detail = integrityMismatchDetail(expected, bytes, actualSha256);
      await patchJob(env, job.id, {
        status: 'failed',
        result: { integrity_error: detail },
        last_error: 'manual_upload_integrity_mismatch',
      });
      return json({ error: 'manual_upload_integrity_mismatch', ...detail }, 422);
    }

    const safeJobMetadata = cleanedJobMetadata(job);
    const nested = (safeJobMetadata.metadata as Record<string, unknown> | undefined) || {};
    const metadata = {
      ...safeJobMetadata,
      article_id: job.article_id,
      source_provider: 'openai_image_generation',
      // A generated image has no external editorial source URL. Dropbox is transport only.
      source_url: null,
      commercial_use_allowed: true,
      local_storage_allowed: true,
      modifications_allowed: true,
      attribution_required: false,
      metadata: {
        ...nested,
        ingest_mode: 'dropbox_chat_bridge',
        manual_upload_job_id: job.id,
        source_integrity_sha256: actualSha256,
        source_integrity_byte_size: bytes.byteLength,
        transport_provider: 'dropbox',
        transport_url_persisted: false,
      },
    };

    const { response: uploaded, result } = await uploadGeneratedHero(
      env,
      baseWorker,
      bytes,
      job.mime_type,
      job.file_name,
      metadata,
    );

    if (!uploaded.ok || !result.asset?.id || !result.asset?.delivery_url) {
      await patchJob(env, job.id, {
        status: 'failed',
        result,
        last_error: `upload_${uploaded.status}`,
      });
      return json({ error: 'manual_upload_failed', upstream_status: uploaded.status, result }, 502);
    }
    if (result.asset.sha256 !== expected.expectedSha256) {
      await patchJob(env, job.id, {
        status: 'failed',
        result,
        last_error: 'manual_upload_upstream_integrity_mismatch',
      });
      return json({ error: 'manual_upload_upstream_integrity_mismatch' }, 502);
    }

    await patchJob(env, job.id, {
      status: 'done',
      asset_id: result.asset.id,
      result,
      last_error: null,
      payload_base64: null,
      metadata: {
        ...safeJobMetadata,
        transport_provider: 'dropbox',
        transport_consumed_at: new Date().toISOString(),
        transport_url_persisted: false,
      },
      consumed_at: new Date().toISOString(),
    });

    return json({
      ok: true,
      asset_id: result.asset.id,
      delivery_url: result.asset.delivery_url,
      deduplicated: Boolean(result.deduplicated),
      ingest_mode: 'dropbox_chat_bridge',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'dropbox_upload_internal_error';
    await patchJob(env, job.id, { status: 'failed', last_error: message.slice(0, 500) });
    console.error('dropbox_chat_media_upload_error', { job_id: job.id, error: message });
    return json({ error: 'manual_upload_internal_error', detail: message }, 502);
  }
};

export const processPendingDropboxChatJobs = async (
  env: Env,
  baseWorker: BaseWorker,
  limit = 5,
): Promise<void> => {
  const jobs = await listPendingDropboxJobs(env, limit);
  for (const job of jobs) {
    const sourceUrl = typeof job.metadata?.dropbox_download_url === 'string'
      ? job.metadata.dropbox_download_url
      : '';
    if (!sourceUrl) continue;
    if (!(await claimJob(env, job))) continue;
    await processDropboxJob(job, sourceUrl, env, baseWorker, true);
  }
};

export const maybeHandleDropboxChatUpload = async (
  request: Request,
  env: Env,
  baseWorker: BaseWorker,
): Promise<Response | null> => {
  const match = new URL(request.url).pathname.match(/^\/manual-upload-dropbox\/([0-9a-f-]{36})$/i);
  if (request.method !== 'POST' || !match) return null;

  const token = new URL(request.url).searchParams.get('token') || '';
  if (!token || token.length < 32) return json({ error: 'manual_upload_token_required' }, 401);

  const job = await getJob(env, match[1]);
  if (!job) return json({ error: 'manual_upload_job_not_found' }, 404);
  if (await sha256Text(token) !== job.token_hash) return json({ error: 'manual_upload_unauthorized' }, 401);
  if (job.status === 'done') return json({ ok: true, already_done: true });
  if (job.status === 'processing') return json({ error: 'manual_upload_in_progress' }, 409);

  let sourceUrl = '';
  try {
    const payload = await request.json<{ source_url?: string }>();
    sourceUrl = typeof payload.source_url === 'string' ? payload.source_url : '';
  } catch {
    return json({ error: 'manual_upload_invalid_json' }, 400);
  }
  return processDropboxJob(job, sourceUrl, env, baseWorker);
};
