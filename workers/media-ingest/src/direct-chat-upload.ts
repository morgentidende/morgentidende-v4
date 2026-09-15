import {
  type BaseWorker,
  type ManualUploadEnv as Env,
  expectedIntegrity,
  getManualUploadJob,
  integrityMismatchDetail,
  manualUploadJson as json,
  patchManualUploadJob,
  sha256Bytes,
  sha256Text,
  uploadGeneratedHero,
} from './manual-chat-upload-shared';

const getJob = (env: Env, id: string) => getManualUploadJob(env, id, 'direct_upload');
const patchJob = (env: Env, id: string, patch: Record<string, unknown>) => (
  patchManualUploadJob(env, id, patch, 'direct_upload')
);

export const maybeHandleDirectChatUpload = async (
  request: Request,
  env: Env,
  baseWorker: BaseWorker,
): Promise<Response | null> => {
  const match = new URL(request.url).pathname.match(/^\/manual-upload-file\/([0-9a-f-]{36})$/i);
  if (request.method !== 'POST' || !match) return null;

  const token = new URL(request.url).searchParams.get('token') || '';
  if (!token || token.length < 32) return json({ error: 'manual_upload_token_required' }, 401);

  const job = await getJob(env, match[1]);
  if (!job) return json({ error: 'manual_upload_job_not_found' }, 404);
  if (new Date(job.expires_at).getTime() <= Date.now()) {
    if (job.status === 'pending') await patchJob(env, job.id, { status: 'expired' });
    return json({ error: 'manual_upload_job_expired' }, 410);
  }
  if (await sha256Text(token) !== job.token_hash) return json({ error: 'manual_upload_unauthorized' }, 401);
  if (job.status === 'done') return json({ ok: true, already_done: true });
  if (job.status === 'processing') return json({ error: 'manual_upload_in_progress' }, 409);
  if (!['pending', 'failed'].includes(job.status)) return json({ error: `manual_upload_${job.status}` }, 409);

  const expected = expectedIntegrity(job.metadata || {});
  if (!expected) return json({ error: 'manual_upload_integrity_metadata_required' }, 422);

  const requestType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);
  if (!allowed.has(requestType) || requestType !== job.mime_type.toLowerCase()) {
    return json({ error: 'manual_upload_mime_mismatch', expected: job.mime_type, actual: requestType }, 415);
  }

  await patchJob(env, job.id, { status: 'processing', last_error: null });
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
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

    const nested = (job.metadata?.metadata as Record<string, unknown> | undefined) || {};
    const metadata = {
      ...(job.metadata || {}),
      article_id: job.article_id,
      source_provider: 'openai_image_generation',
      commercial_use_allowed: true,
      local_storage_allowed: true,
      modifications_allowed: true,
      attribution_required: false,
      metadata: {
        ...nested,
        ingest_mode: 'direct_chat_binary',
        manual_upload_job_id: job.id,
        source_integrity_sha256: actualSha256,
        source_integrity_byte_size: bytes.byteLength,
      },
    };

    const { response, result } = await uploadGeneratedHero(
      env,
      baseWorker,
      bytes,
      job.mime_type,
      job.file_name,
      metadata,
    );

    if (!response.ok || !result.asset?.id || !result.asset?.delivery_url) {
      await patchJob(env, job.id, {
        status: 'failed',
        result,
        last_error: `upload_${response.status}`,
      });
      return json({ error: 'manual_upload_failed', upstream_status: response.status, result }, 502);
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
      consumed_at: new Date().toISOString(),
    });

    return json({
      ok: true,
      asset_id: result.asset.id,
      delivery_url: result.asset.delivery_url,
      deduplicated: Boolean(result.deduplicated),
      ingest_mode: 'direct_chat_binary',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'direct_upload_internal_error';
    await patchJob(env, job.id, { status: 'failed', last_error: message.slice(0, 500) });
    console.error('direct_chat_media_upload_error', { job_id: job.id, error: message });
    return json({ error: 'manual_upload_internal_error' }, 500);
  }
};
