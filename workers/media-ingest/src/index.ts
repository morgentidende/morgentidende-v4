interface Env {
  MEDIA_BUCKET: R2Bucket;
  MEDIA_PUBLIC_BASE_URL: string;
  MEDIA_MAX_BYTES?: string;
  MEDIA_INGEST_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

type IngestRequest = {
  source_url?: string;
  article_id?: string;
  source_provider?: string;
  source_asset_id?: string;
  license_name?: string;
  license_url?: string;
  credit_text?: string;
  rights_notes?: string;
  rights_expires_at?: string;
  commercial_use_allowed: boolean;
  local_storage_allowed: boolean;
  modifications_allowed?: boolean;
  attribution_required?: boolean;
  alt_text?: string;
  metadata?: Record<string, unknown>;
};

type MediaAsset = {
  id: string;
  delivery_url: string;
  storage_key: string;
  sha256: string;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  }
});

const unauthorized = () => json({ error: 'unauthorized' }, 401);

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const isAuthorized = (request: Request, env: Env) => {
  const auth = request.headers.get('authorization') || '';
  const expected = `Bearer ${env.MEDIA_INGEST_TOKEN}`;
  return Boolean(env.MEDIA_INGEST_TOKEN) && safeEqual(auth, expected);
};

const isUnsafeSourceUrl = (raw: string) => {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return true;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(host)) return true;
    const parts = host.split('.').map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    }
    return false;
  } catch {
    return true;
  }
};

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer))
  .map((byte) => byte.toString(16).padStart(2, '0'))
  .join('');

const extensionFor = (mime: string) => {
  const normalized = mime.split(';')[0].trim().toLowerCase();
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/gif': 'gif'
  };
  return map[normalized] || null;
};

const supabaseHeaders = (env: Env, extra: Record<string, string> = {}) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'content-type': 'application/json',
  ...extra
});

const findAssetByHash = async (env: Env, sha256: string): Promise<MediaAsset | null> => {
  const url = `${env.SUPABASE_URL}/rest/v1/media_assets?sha256=eq.${encodeURIComponent(sha256)}&select=id,delivery_url,storage_key,sha256&limit=1`;
  const response = await fetch(url, { headers: supabaseHeaders(env) });
  if (!response.ok) throw new Error(`Supabase lookup failed: ${response.status}`);
  const rows = await response.json<MediaAsset[]>();
  return rows[0] || null;
};

const attachAssetToArticle = async (
  env: Env,
  articleId: string,
  asset: MediaAsset,
  input: IngestRequest
) => {
  const patch = {
    hero_media_id: asset.id,
    hero_url: asset.delivery_url,
    hero_alt: input.alt_text || null,
    hero_source_url: input.source_url || null,
    hero_credit: input.credit_text || null,
    hero_license: input.license_name || null,
    hero_license_url: input.license_url || null
  };
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(articleId)}`, {
    method: 'PATCH',
    headers: supabaseHeaders(env, { Prefer: 'return=minimal' }),
    body: JSON.stringify(patch)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Article update failed: ${response.status} ${detail.slice(0, 300)}`);
  }
};

const insertAsset = async (
  env: Env,
  input: IngestRequest,
  values: { sha256: string; storageKey: string; deliveryUrl: string; mime: string; byteSize: number }
): Promise<MediaAsset> => {
  const row = {
    status: 'ready',
    asset_kind: 'hero',
    source_url: input.source_url || null,
    source_provider: input.source_provider || null,
    source_asset_id: input.source_asset_id || null,
    license_name: input.license_name || null,
    license_url: input.license_url || null,
    credit_text: input.credit_text || null,
    rights_notes: input.rights_notes || null,
    rights_verified_at: new Date().toISOString(),
    rights_expires_at: input.rights_expires_at || null,
    commercial_use_allowed: true,
    local_storage_allowed: true,
    modifications_allowed: Boolean(input.modifications_allowed),
    attribution_required: Boolean(input.attribution_required),
    storage_provider: 'cloudflare_r2',
    storage_bucket: 'morgentidende-media',
    storage_key: values.storageKey,
    delivery_url: values.deliveryUrl,
    mime_type: values.mime,
    byte_size: values.byteSize,
    sha256: values.sha256,
    alt_text: input.alt_text || null,
    created_by: 'media_agent',
    metadata: input.metadata || {}
  };

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/media_assets?select=id,delivery_url,storage_key,sha256`, {
    method: 'POST',
    headers: supabaseHeaders(env, { Prefer: 'return=representation' }),
    body: JSON.stringify(row)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase insert failed: ${response.status} ${detail.slice(0, 300)}`);
  }
  const rows = await response.json<MediaAsset[]>();
  if (!rows[0]) throw new Error('Supabase insert returned no asset');
  return rows[0];
};

const validateRights = (input: IngestRequest) => {
  return Boolean(input.commercial_use_allowed && input.local_storage_allowed);
};

const storeBytes = async (
  env: Env,
  input: IngestRequest,
  bytes: ArrayBuffer,
  mime: string
) => {
  const ext = extensionFor(mime);
  if (!ext) return json({ error: 'unsupported_image_type', mime }, 415);

  const maxBytes = Number(env.MEDIA_MAX_BYTES || '20971520');
  if (bytes.byteLength === 0) return json({ error: 'empty_image' }, 422);
  if (bytes.byteLength > maxBytes) return json({ error: 'image_too_large' }, 413);

  const sha256 = hex(await crypto.subtle.digest('SHA-256', bytes));
  const duplicate = await findAssetByHash(env, sha256);
  if (duplicate) {
    if (input.article_id) await attachAssetToArticle(env, input.article_id, duplicate, input);
    return json({ ok: true, deduplicated: true, asset: duplicate });
  }

  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const storageKey = `heroes/${year}/${month}/${sha256}.${ext}`;
  const publicBase = env.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, '');
  const deliveryUrl = `${publicBase}/${storageKey}`;

  await env.MEDIA_BUCKET.put(storageKey, bytes, {
    httpMetadata: {
      contentType: mime,
      cacheControl: 'public, max-age=31536000, immutable'
    },
    customMetadata: {
      sha256,
      sourceProvider: input.source_provider || 'unknown'
    }
  });

  let asset: MediaAsset;
  try {
    asset = await insertAsset(env, input, {
      sha256,
      storageKey,
      deliveryUrl,
      mime,
      byteSize: bytes.byteLength
    });
  } catch (error) {
    const racedDuplicate = await findAssetByHash(env, sha256);
    if (!racedDuplicate) {
      await env.MEDIA_BUCKET.delete(storageKey);
      throw error;
    }
    asset = racedDuplicate;
  }

  if (input.article_id) await attachAssetToArticle(env, input.article_id, asset, input);

  return json({
    ok: true,
    deduplicated: false,
    asset,
    transformed_example: `https://morgentidende.dk/cdn-cgi/image/width=960,fit=cover,format=auto,quality=82/${deliveryUrl}`
  }, 201);
};

const ingest = async (request: Request, env: Env) => {
  let input: IngestRequest;
  try {
    input = await request.json<IngestRequest>();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  if (!input?.source_url) return json({ error: 'source_url_required' }, 400);
  if (!validateRights(input)) return json({ error: 'archive_rights_required' }, 422);
  if (isUnsafeSourceUrl(input.source_url)) return json({ error: 'source_url_not_allowed' }, 400);

  const source = await fetch(input.source_url, {
    redirect: 'follow',
    headers: { 'user-agent': 'MorgentidendeMedia/1.0' }
  });
  if (!source.ok) return json({ error: 'source_fetch_failed', status: source.status }, 422);

  const mime = (source.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const declaredLength = Number(source.headers.get('content-length') || '0');
  const maxBytes = Number(env.MEDIA_MAX_BYTES || '20971520');
  if (declaredLength > maxBytes) return json({ error: 'image_too_large' }, 413);

  return storeBytes(env, input, await source.arrayBuffer(), mime);
};

const upload = async (request: Request, env: Env) => {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return json({ error: 'multipart_form_required' }, 415);
  }

  const form = await request.formData();
  const file = form.get('file');
  const metadataRaw = form.get('metadata');
  if (!(file instanceof File)) return json({ error: 'file_required' }, 400);
  if (typeof metadataRaw !== 'string') return json({ error: 'metadata_required' }, 400);

  let input: IngestRequest;
  try {
    input = JSON.parse(metadataRaw) as IngestRequest;
  } catch {
    return json({ error: 'invalid_metadata_json' }, 400);
  }

  if (!validateRights(input)) return json({ error: 'archive_rights_required' }, 422);
  const mime = (file.type || '').split(';')[0].trim().toLowerCase();
  if (!extensionFor(mime)) return json({ error: 'unsupported_image_type', mime }, 415);

  const maxBytes = Number(env.MEDIA_MAX_BYTES || '20971520');
  if (file.size > maxBytes) return json({ error: 'image_too_large' }, 413);

  input.source_provider = input.source_provider || 'openai_image_generation';
  input.metadata = {
    ...(input.metadata || {}),
    ingest_mode: 'direct_upload',
    original_filename: file.name || null
  };

  return storeBytes(env, input, await file.arrayBuffer(), mime);
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'morgentidende-media-ingest' });
    }

    if (!isAuthorized(request, env)) return unauthorized();

    try {
      if (request.method === 'POST' && url.pathname === '/ingest') return await ingest(request, env);
      if (request.method === 'POST' && url.pathname === '/upload') return await upload(request, env);
      return json({ error: 'not_found' }, 404);
    } catch (error) {
      console.error('media_ingest_error', error);
      return json({ error: 'internal_error' }, 500);
    }
  }
};
