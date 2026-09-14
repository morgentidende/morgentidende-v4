import worker from './index';

interface Env {
  MEDIA_BUCKET: R2Bucket;
  MEDIA_PUBLIC_BASE_URL: string;
  MEDIA_MAX_BYTES?: string;
  MEDIA_INGEST_TOKEN: string;
  IMAGES: any;
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

type MediaAssetResult = {
  id?: string;
  delivery_url?: string;
  sha256?: string;
};

type MediaUploadResult = Record<string, unknown> & {
  asset?: MediaAssetResult;
  deduplicated?: boolean;
};

type SvgMaster = {
  id: string;
  sha256: string;
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

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer))
  .map((byte) => byte.toString(16).padStart(2, '0'))
  .join('');

const sha256Text = async (value: string) => hex(await crypto.subtle.digest(
  'SHA-256',
  new TextEncoder().encode(value),
));

const sha256Bytes = async (bytes: Uint8Array) => hex(await crypto.subtle.digest('SHA-256', bytes));

const base64ToBytes = (value: string) => {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i += 1) bytes[i] = decoded.charCodeAt(i);
  return bytes;
};

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

const failManualUpload = async (
  env: Env,
  jobId: string,
  error: string,
  status: number,
  result?: Record<string, unknown>,
) => {
  await patchManualUploadJob(env, jobId, {
    status: 'failed',
    ...(result ? { result } : {}),
    last_error: error,
  });
  return json({ error, ...(result || {}) }, status);
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

const parseSvgDimensions = (svg: string) => {
  const tag = svg.match(/<svg\b[^>]*>/i)?.[0] || '';
  if (!tag) return null;
  const numberAttr = (name: string) => {
    const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([0-9]+(?:\\.[0-9]+)?)(?:px)?["']`, 'i'));
    return match ? Number(match[1]) : null;
  };
  let width = numberAttr('width');
  let height = numberAttr('height');
  const viewBox = tag.match(/viewBox\s*=\s*["']\s*[-0-9.]+[ ,]+[-0-9.]+[ ,]+([0-9.]+)[ ,]+([0-9.]+)\s*["']/i);
  if ((!width || !height) && viewBox) {
    width ||= Number(viewBox[1]);
    height ||= Number(viewBox[2]);
  }
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width: Math.round(width), height: Math.round(height) };
};

const ensureSvgRasterDimensions = (svg: string, dimensions: { width: number; height: number }) => {
  const tag = svg.match(/<svg\b[^>]*>/i)?.[0];
  if (!tag) return svg;
  let updated = tag;
  if (!/\bwidth\s*=/i.test(tag)) updated = updated.replace(/>$/, ` width="${dimensions.width}"` + '>');
  if (!/\bheight\s*=/i.test(updated)) updated = updated.replace(/>$/, ` height="${dimensions.height}"` + '>');
  return svg.replace(tag, updated);
};

const archiveSvgMaster = async (
  env: Env,
  job: ManualUploadJob,
  sourceText: string,
  sha256: string,
  byteSize: number,
): Promise<SvgMaster> => {
  const rightsNotes = typeof job.metadata?.rights_notes === 'string' ? job.metadata.rights_notes : null;
  const metadata = (job.metadata?.metadata as Record<string, unknown> | undefined) || {};
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/media_source_masters?on_conflict=sha256&select=id,sha256`, {
    method: 'POST',
    headers: supabaseHeaders(env, { Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify({
      sha256,
      source_mime: 'image/svg+xml',
      byte_size: byteSize,
      source_text: sourceText,
      source_provider: 'openai_image_generation',
      rights_notes: rightsNotes,
      metadata: {
        ...metadata,
        manual_upload_job_id: job.id,
        original_filename: job.file_name || null,
      },
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`svg_master_archive_failed:${response.status}:${detail.slice(0, 300)}`);
  }
  const rows = await response.json<SvgMaster[]>();
  if (!rows[0]) throw new Error('svg_master_archive_returned_no_row');
  return rows[0];
};

const linkSvgMasterToAsset = async (env: Env, masterId: string, assetId: string) => {
  const response = await fetch(`${env.SUPABASE_URL}/res