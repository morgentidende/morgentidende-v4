interface Env {
  ADMIN_TOKEN: string;
  CHAT_MEDIA_TOKEN?: string;
  MEDIA_INGEST: Fetcher;
}

type ChatUploadBody = {
  source_url?: string;
  article_id?: string;
  file_name?: string;
  alt_text?: string;
  generation_metadata?: Record<string, unknown>;
};

type SourceIngestBody = {
  source_url?: string;
  article_id?: string;
  source_provider?: string;
  source_asset_id?: string;
  license_name?: string;
  license_url?: string;
  credit_text?: string;
  rights_notes?: string;
  rights_expires_at?: string;
  commercial_use_allowed?: boolean;
  local_storage_allowed?: boolean;
  modifications_allowed?: boolean;
  attribution_required?: boolean;
  alt_text?: string;
  metadata?: Record<string, unknown>;
};

type MediaAssetResult = {
  id?: string;
  delivery_url?: string;
  storage_key?: string;
  sha256?: string;
};

type MediaUploadResult = {
  ok?: boolean;
  queued?: boolean;
  job_id?: string;
  deduplicated?: boolean;
  asset?: MediaAssetResult;
  error?: string;
  [key: string]: unknown;
};

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_ALT_LENGTH = 500;
const MAX_GENERATION_METADATA_BYTES = 16 * 1024;
const ARTICLE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  }
});

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const authorized = (request: Request, env: Env) => {
  const dedicated = request.headers.get('x-morgentidende-admin-token') || '';
  if (env.ADMIN_TOKEN && safeEqual(dedicated, env.ADMIN_TOKEN)) return true;
  const auth = request.headers.get('authorization') || '';
  return Boolean(env.ADMIN_TOKEN) && safeEqual(auth, `Bearer ${env.ADMIN_TOKEN}`);
};

const normalizeMime = (value: string) => value.split(';')[0].trim().toLowerCase();

const allowedDropboxHost = (hostname: string) => {
  const host = hostname.toLowerCase();
  return host === 'dropboxusercontent.com' || host.endsWith('.dropboxusercontent.com');
};

const extensionForMime = (mime: string) => mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];

const sanitizeFileName = (value: string | undefined, fallbackExt: string) => {
  const raw = (value || `manual-chat-hero.${fallbackExt}`).trim();
  const leaf = raw.split(/[\\/]/).pop() || `manual-chat-hero.${fallbackExt}`;
  const safe = leaf.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120);
  return safe || `manual-chat-hero.${fallbackExt}`;
};

const parseJson = async <T>(response: Response): Promise<T | { raw: string }> => {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { raw: text.slice(0, 1000) };
  }
};

const validateArticleId = (articleId: string | undefined) => Boolean(articleId && ARTICLE_ID_RE.test(articleId));

const validateChatUploadBody = (body: ChatUploadBody): Response | null => {
  if (!body.source_url || !body.article_id) {
    return json({ error: 'source_url_and_article_id_required' }, 400);
  }
  if (!validateArticleId(body.article_id)) return json({ error: 'valid_article_id_required' }, 400);
  if ((body.alt_text || '').length > MAX_ALT_LENGTH) return json({ error: 'alt_text_too_long' }, 400);

  const metadataBytes = new TextEncoder().encode(JSON.stringify(body.generation_metadata || {})).byteLength;
  if (metadataBytes > MAX_GENERATION_METADATA_BYTES) {
    return json({ error: 'generation_metadata_too_large' }, 413);
  }
  return null;
};

const validateSourceIngestBody = (body: SourceIngestBody): Response | null => {
  if (!body.source_url || !body.article_id) {
    return json({ error: 'source_url_and_article_id_required' }, 400);
  }
  if (!validateArticleId(body.article_id)) return json({ error: 'valid_article_id_required' }, 400);
  if ((body.alt_text || '').length > MAX_ALT_LENGTH) return json({ error: 'alt_text_too_long' }, 400);
  if (body.commercial_use_allowed !== true || body.local_storage_allowed !== true) {
    return json({ error: 'archive_rights_required' }, 422);
  }
  return null;
};

const callMediaIngest = async (
  env: Env,
  path: '/ingest' | '/upload',
  body: BodyInit,
  contentType?: string
): Promise<Response> => {
  if (!env.CHAT_MEDIA_TOKEN) return json({ error: 'chat_media_token_missing' }, 503);
  if (!env.MEDIA_INGEST) return json({ error: 'media_ingest_binding_missing' }, 503);

  const headers = new Headers({ authorization: `Bearer ${env.CHAT_MEDIA_TOKEN}` });
  if (contentType) headers.set('content-type', contentType);

  try {
    return await env.MEDIA_INGEST.fetch(new Request(`https://media-ingest.internal${path}`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(25_000)
    }));
  } catch {
    return json({ error: 'media_ingest_unreachable' }, 502);
  }
};

const fetchTemporaryImage = async (rawUrl: string) => {
  let sourceUrl: URL;
  try {
    sourceUrl = new URL(rawUrl);
  } catch {
    return { error: json({ error: 'invalid_source_url' }, 400) };
  }

  if (sourceUrl.protocol !== 'https:' || !allowedDropboxHost(sourceUrl.hostname)) {
    return { error: json({ error: 'source_url_not_allowed' }, 403) };
  }

  let source: Response;
  try {
    source = await fetch(sourceUrl.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000)
    });
  } catch {
    return { error: json({ error: 'source_fetch_failed' }, 502) };
  }

  if (!source.ok) return { error: json({ error: 'source_fetch_failed', status: source.status }, 502) };

  const mime = normalizeMime(source.headers.get('content-type') || '');
  if (!ALLOWED_MIME.has(mime)) return { error: json({ error: 'unsupported_image_type', mime }, 415) };

  const declaredLength = Number(source.headers.get('content-length') || '0');
  if (declaredLength > MAX_BYTES) return { error: json({ error: 'image_too_large' }, 413) };

  const bytes = await source.arrayBuffer();
  if (!bytes.byteLength) return { error: json({ error: 'empty_image' }, 422) };
  if (bytes.byteLength > MAX_BYTES) return { error: json({ error: 'image_too_large' }, 413) };

  return { bytes, mime };
};

const isValidReadyAssetResult = (result: MediaUploadResult) => Boolean(
  result.ok === true &&
  result.asset?.id &&
  result.asset?.delivery_url &&
  result.asset?.storage_key &&
  result.asset?.sha256
);

const forwardResult = async (upstream: Response) => {
  const result = await parseJson<MediaUploadResult>(upstream);
  if (!upstream.ok) return json(result, upstream.status);
  return json(result, upstream.status);
};

const handleSourceIngest = async (request: Request, env: Env): Promise<Response> => {
  let body: SourceIngestBody;
  try {
    body = await request.json<SourceIngestBody>();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const bodyError = validateSourceIngestBody(body);
  if (bodyError) return bodyError;

  const payload = JSON.stringify({
    ...body,
    metadata: {
      ...(body.metadata || {}),
      origin: 'chat_source_hero',
      pipeline_version: 3
    }
  });

  const upstream = await callMediaIngest(env, '/ingest', payload, 'application/json');
  const result = await parseJson<MediaUploadResult>(upstream);

  if (upstream.status === 202 && 'queued' in result && (result as MediaUploadResult).queued === true) {
    return json({
      ok: false,
      hero_status: 'hero_pending',
      article_id: body.article_id,
      ...(result as MediaUploadResult)
    }, 202);
  }

  if (!upstream.ok) return json(result, upstream.status);
  if (!('ok' in result) || !isValidReadyAssetResult(result as MediaUploadResult)) {
    console.error('source_hero_invalid_upstream_result', result);
    return json({ error: 'media_ingest_incomplete_result' }, 502);
  }

  const valid = result as MediaUploadResult;
  return json({
    ok: true,
    hero_status: 'hero_ready',
    deduplicated: Boolean(valid.deduplicated),
    article_id: body.article_id,
    asset: valid.asset
  }, upstream.status);
};

const handleChatUpload = async (request: Request, env: Env): Promise<Response> => {
  let body: ChatUploadBody;
  try {
    body = await request.json<ChatUploadBody>();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const bodyError = validateChatUploadBody(body);
  if (bodyError) return bodyError;

  const fetched = await fetchTemporaryImage(body.source_url!);
  if (fetched.error) return fetched.error;

  const ext = extensionForMime(fetched.mime!);
  const file = new File(
    [fetched.bytes!],
    sanitizeFileName(body.file_name, ext),
    { type: fetched.mime }
  );

  const form = new FormData();
  form.set('file', file);
  form.set('metadata', JSON.stringify({
    article_id: body.article_id,
    source_provider: 'openai_image_generation',
    commercial_use_allowed: true,
    local_storage_allowed: true,
    modifications_allowed: true,
    attribution_required: false,
    alt_text: body.alt_text || null,
    metadata: {
      origin: 'manual_chat_ai_hero',
      pipeline_version: 3,
      temporary_transport: 'dropbox',
      ...(body.generation_metadata || {})
    }
  }));

  const upstream = await callMediaIngest(env, '/upload', form);
  const result = await parseJson<MediaUploadResult>(upstream);
  if (!upstream.ok) return json(result, upstream.status);

  if (!('ok' in result) || !isValidReadyAssetResult(result as MediaUploadResult)) {
    console.error('manual_chat_ai_hero_invalid_upstream_result', result);
    return json({ error: 'media_ingest_incomplete_result' }, 502);
  }

  const valid = result as MediaUploadResult;
  return json({
    ok: true,
    hero_status: 'hero_ready',
    deduplicated: Boolean(valid.deduplicated),
    article_id: body.article_id,
    asset: valid.asset
  }, upstream.status);
};

export const handleMediaChat = async (request: Request, env: Env): Promise<Response | null> => {
  const url = new URL(request.url);
  const isChatUpload = request.method === 'POST' && url.pathname === '/media/chat-upload';
  const isSourceIngest = request.method === 'POST' && url.pathname === '/media/source-ingest';
  if (!isChatUpload && !isSourceIngest) return null;

  if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);
  if (!env.CHAT_MEDIA_TOKEN) return json({ error: 'chat_media_token_missing' }, 503);
  if (!env.MEDIA_INGEST) return json({ error: 'media_ingest_binding_missing' }, 503);

  return isSourceIngest
    ? handleSourceIngest(request, env)
    : handleChatUpload(request, env);
};
