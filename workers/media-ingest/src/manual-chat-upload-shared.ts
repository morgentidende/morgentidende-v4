export interface ManualUploadEnv {
  MEDIA_INGEST_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export type ManualJob = {
  id: string;
  article_id: string;
  token_hash: string;
  mime_type: string;
  file_name: string | null;
  metadata: Record<string, unknown>;
  status: 'pending' | 'processing' | 'done' | 'failed' | 'expired';
  expires_at: string;
};

export type BaseWorker = {
  fetch(request: Request, env: ManualUploadEnv): Promise<Response>;
};

export type MediaUploadResult = Record<string, unknown> & {
  asset?: { id?: string; delivery_url?: string; sha256?: string };
  deduplicated?: boolean;
};

export type ExpectedIntegrity = {
  expectedByteSize: number;
  expectedSha256: string;
};

export const manualUploadJson = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export const manualUploadHeaders = (
  env: ManualUploadEnv,
  extra: Record<string, string> = {},
) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'content-type': 'application/json',
  ...extra,
});

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer))
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');

export const sha256Text = async (value: string) => hex(await crypto.subtle.digest(
  'SHA-256', new TextEncoder().encode(value),
));

export const sha256Bytes = async (bytes: Uint8Array) => hex(await crypto.subtle.digest('SHA-256', bytes));

export const getManualUploadJob = async (
  env: ManualUploadEnv,
  id: string,
  errorPrefix: string,
): Promise<ManualJob | null> => {
  const params = new URLSearchParams({
    id: `eq.${id}`,
    select: 'id,article_id,token_hash,mime_type,file_name,metadata,status,expires_at',
    limit: '1',
  });
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/manual_chat_media_upload_jobs?${params}`, {
    headers: manualUploadHeaders(env),
  });
  if (!response.ok) throw new Error(`${errorPrefix}_lookup_failed:${response.status}`);
  const rows = await response.json<ManualJob[]>();
  return rows[0] || null;
};

export const patchManualUploadJob = async (
  env: ManualUploadEnv,
  id: string,
  patch: Record<string, unknown>,
  errorPrefix: string,
) => {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/manual_chat_media_upload_jobs?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: manualUploadHeaders(env, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`${errorPrefix}_patch_failed:${response.status}`);
};

export const expectedIntegrity = (metadata: Record<string, unknown>): ExpectedIntegrity | null => {
  const expectedByteSize = Number(metadata.expected_byte_size);
  const expectedSha256 = typeof metadata.expected_sha256 === 'string'
    ? metadata.expected_sha256.trim().toLowerCase()
    : '';
  if (!Number.isSafeInteger(expectedByteSize) || expectedByteSize <= 0) return null;
  if (!/^[0-9a-f]{64}$/.test(expectedSha256)) return null;
  return { expectedByteSize, expectedSha256 };
};

export const integrityMismatchDetail = (
  expected: ExpectedIntegrity,
  bytes: Uint8Array,
  actualSha256: string,
) => ({
  expected_byte_size: expected.expectedByteSize,
  actual_byte_size: bytes.byteLength,
  expected_sha256: expected.expectedSha256,
  actual_sha256: actualSha256,
});

export const uploadGeneratedHero = async (
  env: ManualUploadEnv,
  baseWorker: BaseWorker,
  bytes: Uint8Array,
  mimeType: string,
  fileName: string | null,
  metadata: Record<string, unknown>,
) => {
  const form = new FormData();
  form.set('file', new File([bytes], fileName || 'generated-hero', { type: mimeType }));
  form.set('metadata', JSON.stringify(metadata));

  const response = await baseWorker.fetch(new Request('https://internal/upload', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.MEDIA_INGEST_TOKEN}` },
    body: form,
  }), env);
  const result = await response.clone().json<MediaUploadResult>().catch(() => ({} as MediaUploadResult));
  return { response, result };
};
