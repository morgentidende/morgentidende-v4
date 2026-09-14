interface Env {
  MEDIA_BUCKET: R2Bucket;
  MEDIA_PUBLIC_BASE_URL: string;
  MEDIA_MAX_BYTES?: string;
  MEDIA_INGEST_TOKEN: string;
  IMAGES: any;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

type ManualJob = {
  id: string;
  article_id: string;
  token_hash: string;
  payload_base64: string | null;
  mime_type: string;
  file_name: string | null;
  metadata: Record<string, unknown>;
  status: string;
  expires_at: string;
};

type BaseWorker = {
  fetch(request: Request, env: Env): Promise<Response>;
};

const headers = (env: Env, extra: Record<string, string> = {}) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'content-type': 'application/json',
  ...extra,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer))
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');

const sha256Text = async (text: string) => hex(await crypto.subtle.digest(
  'SHA-256', new TextEncoder().encode(text),
));

const sha256Bytes = async (bytes: Uint8Array) => hex(await crypto.subtle.digest('SHA-256', bytes));

const base64ToBytes = (value: string) => {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i += 1) bytes[i] = decoded.charCodeAt(i);
  return bytes;
};

const patchJob = async (env: Env, id: string, patch: Record<string, unknown>) => {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/manual_chat_media_upload_jobs?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: headers(env, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`svg_job_patch_failed:${response.status}`);
};

const getJob = async (env: Env, id: string): Promise<ManualJob | null> => {
  const params = new URLSearchParams({
    id: `eq.${id}`,
    select: 'id,article_id,token_hash,payload_base64,mime_type,file_name,metadata,status,expires_at',
    limit: '1',
  });
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/manual_chat_media_upload_jobs?${params}`, { headers: headers(env) });
  if (!response.ok) throw new Error(`svg_job_lookup_failed:${response.status}`);
  const rows = await response.json<ManualJob[]>();
  return rows[0] || null;
};

const parseDimensions = (svg: string) => {
  const tag = svg.match(/<svg\b[^>]*>/i)?.[0] || '';
  if (!tag) return null;
  const attr = (name: string) => {
    const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([0-9]+(?:\\.[0-9]+)?)(?:px)?["']`, 'i'));
    return match ? Number(match[1]) : null;
  };
  let width = attr('width');
  let height = attr('height');
  const viewBox = tag.match(/viewBox\s*=\s*["']\s*[-0-9.]+[ ,]+[-0-9.]+[ ,]+([0-9.]+)[ ,]+([0-9.]+)\s*["']/i);
  if ((!width || !height) && viewBox) {
    width ||= Number(viewBox[1]);
    height ||= Number(viewBox[2]);
  }
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width: Math.round(width), height: Math.round(height) };
};

const ensureDimensions = (svg: string, dimensions: { width: number; height: number }) => {
  const tag = svg.match(/<svg\b[^>]*>/i)?.[0];
  if (!tag) return svg;
  let next = tag;
  if (!/\bwidth\s*=/i.test(next)) next = next.replace(/>$/, ` width="${dimensions.width}">`);
  if (!/\bheight\s*=/i.test(next)) next = next.replace(/>$/, ` height="${dimensions.height}">`);
  return svg.replace(tag, next);
};

const isSafeControlledSvg = (svg: string) => {
  if (!/<svg\b/i.test(svg)) return false;
  if (/<script\b/i.test(svg) || /<foreignObject\b/i.test(svg)) return false;
  if (/\bon[a-z]+\s*=/i.test(svg)) return false;
  if (/(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|data:text\/html|javascript:)/i.test(svg)) return false;
  return true;
};

const archiveMaster = async (
  env: Env,
  job: ManualJob,
  svg: string,
  sha256: string,
  byteSize: number,
  dimensions: { width: number; height: number },
) => {
  const nested = (job.metadata?.metadata as Record<string, unknown> | undefined) || {};
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/media_source_masters?on_conflict=sha256&select=id,sha256`, {
    method: 'POST',
    headers: headers(env, { Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify({
      sha256,
      source_mime: 'image/svg+xml',
      byte_size: byteSize,
      source_text: svg,
      source_provider: 'openai_image_generation',
      rights_notes: typeof job.metadata?.rights_notes === 'string' ? job.metadata.rights_notes : null,
      metadata: {
        ...nested,
        manual_upload_job_id: job.id,
        original_filename: job.file_name || null,
        source_dimensions: dimensions,
        controlled_svg: true,
      },
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`svg_master_archive_failed:${response.status}:${(await response.text()).slice(0, 200)}`);
  const rows = await response.json<Array<{ id: string; sha256: string }>>();
  if (!rows[0]) throw new Error('svg_master_archive_returned_no_row');
  return rows[0];
};

const linkMaster = async (env: Env, masterId: string, assetId: string) => {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/media_source_masters?id=eq.${encodeURIComponent(masterId)}`, {
    method: 'PATCH',
    headers: headers(env, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ asset_id: assetId, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`svg_master_link_failed:${response.status}`);
};

export const maybeHandleSvgChatUpload = async (
  request: Request,
  env: Env,
  baseWorker: BaseWorker,
): Promise<Response | null> => {
  const match = new URL(request.url).pathname.match(/^\/manual-upload\/([0-9a-f-]{36})$/i);
  if (request.method !== 'GET' || !match) return null;

  const job = await getJob(env, match[1]);
  if (!job || job.mime_type.toLowerCase() !== 'image/svg+xml') return null;

  const token = new URL(request.url).searchParams.get('token') || '';
  if (!token || token.length < 32) return json({ error: 'manual_upload_token_required' }, 401);
  if (await sha256Text(token) !== job.token_hash) return json({ error: 'manual_upload_unauthorized' }, 401);
  if (new Date(job.expires_at).getTime() <= Date.now()) {
    if (job.status === 'pending') await patchJob(env, job.id, { status: 'expired' });
    return json({ error: 'manual_upload_job_expired' }, 410);
  }
  if (job.status === 'done') return json({ ok: true, already_done: true });
  if (job.status === 'processing') return json({ error: 'manual_upload_in_progress' }, 409);
  if (!['pending', 'failed'].includes(job.status) || !job.payload_base64) return json({ error: 'manual_upload_not_ready' }, 409);

  const expectedSize = Number(job.metadata?.expected_byte_size);
  const expectedSha = typeof job.metadata?.expected_sha256 === 'string' ? job.metadata.expected_sha256.toLowerCase() : '';
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || !/^[0-9a-f]{64}$/.test(expectedSha)) {
    return json({ error: 'manual_upload_integrity_metadata_required' }, 422);
  }

  await patchJob(env, job.id, { status: 'processing', last_error: null });
  try {
    const bytes = base64ToBytes(job.payload_base64);
    const sourceSha = await sha256Bytes(bytes);
    if (bytes.byteLength !== expectedSize || sourceSha !== expectedSha) throw new Error('manual_upload_integrity_mismatch');

    const svg = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!isSafeControlledSvg(svg)) throw new Error('unsafe_or_invalid_svg_master');
    const dimensions = parseDimensions(svg);
    if (!dimensions) throw new Error('svg_dimensions_unreadable');
    if (dimensions.width < 800 || dimensions.height < 450) throw new Error(`svg_dimensions_too_small:${dimensions.width}x${dimensions.height}`);

    const master = await archiveMaster(env, job, svg, sourceSha, bytes.byteLength, dimensions);
    const normalizedSvg = ensureDimensions(svg, dimensions);
    const input = new Blob([normalizedSvg], { type: 'image/svg+xml' }).stream();
    const rasterResponse = (await env.IMAGES.input(input).output({ format: 'image/webp', quality: 90 })).response();
    if (!rasterResponse.ok) throw new Error(`svg_rasterize_failed:${rasterResponse.status}`);
    const rasterBytes = await rasterResponse.arrayBuffer();
    if (!rasterBytes.byteLength) throw new Error('svg_rasterize_empty');

    const nested = (job.metadata?.metadata as Record<string, unknown> | undefined) || {};
    const form = new FormData();
    form.set('file', new File([rasterBytes], (job.file_name || 'generated-hero').replace(/\.svg$/i, '') + '.webp', { type: 'image/webp' }));
    form.set('metadata', JSON.stringify({
      ...job.metadata,
      article_id: job.article_id,
      source_provider: 'openai_image_generation',
      commercial_use_allowed: true,
      local_storage_allowed: true,
      modifications_allowed: true,
      attribution_required: false,
      metadata: {
        ...nested,
        ingest_mode: 'manual_chat_svg_raster_bridge',
        manual_upload_job_id: job.id,
        source_master_id: master.id,
        source_master_sha256: sourceSha,
        source_master_mime: 'image/svg+xml',
        source_dimensions: dimensions,
        published_raster_mime: 'image/webp',
      },
    }));

    const uploaded = await baseWorker.fetch(new Request('https://internal/upload', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.MEDIA_INGEST_TOKEN}` },
      body: form,
    }), env);
    const result = await uploaded.clone().json<any>().catch(() => ({}));
    if (!uploaded.ok || !result?.asset?.id || !result?.asset?.delivery_url) {
      throw new Error(`svg_raster_upload_failed:${uploaded.status}`);
    }

    await linkMaster(env, master.id, result.asset.id);
    await patchJob(env, job.id, {
      status: 'done',
      asset_id: result.asset.id,
      result: { ...result, source_master_id: master.id, source_master_sha256: sourceSha },
      last_error: null,
      payload_base64: null,
      consumed_at: new Date().toISOString(),
    });

    return json({
      ok: true,
      asset_id: result.asset.id,
      delivery_url: result.asset.delivery_url,
      source_master_id: master.id,
      source_master_sha256: sourceSha,
      published_mime: 'image/webp',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'svg_upload_internal_error';
    await patchJob(env, job.id, { status: 'failed', last_error: message.slice(0, 500) });
    return json({ error: message }, 422);
  }
};
