interface Env {
  ADMIN_TOKEN: string;
  CHAT_MEDIA_TOKEN?: string;
  MEDIA_INGEST_URL?: string;
}

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

const allowedDropboxHost = (hostname: string) => {
  const host = hostname.toLowerCase();
  return host === 'dropboxusercontent.com' || host.endsWith('.dropboxusercontent.com');
};

const normalizeMime = (value: string) => value.split(';')[0].trim().toLowerCase();
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const MAX_BYTES = 20 * 1024 * 1024;

type ChatUploadBody = {
  source_url?: string;
  article_id?: string;
  file_name?: string;
  alt_text?: string;
  generation_metadata?: Record<string, unknown>;
};

export const handleMediaChat = async (request: Request, env: Env): Promise<Response | null> => {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/media/chat-upload') return null;

  if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);
  if (!env.CHAT_MEDIA_TOKEN) return json({ error: 'chat_media_token_missing' }, 503);

  let body: ChatUploadBody;
  try {
    body = await request.json<ChatUploadBody>();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  if (!body.source_url || !body.article_id) {
    return json({ error: 'source_url_and_article_id_required' }, 400);
  }

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(body.source_url);
  } catch {
    return json({ error: 'invalid_source_url' }, 400);
  }

  if (sourceUrl.protocol !== 'https:' || !allowedDropboxHost(sourceUrl.hostname)) {
    return json({ error: 'source_url_not_allowed' }, 403);
  }

  let source: Response;
  try {
    source = await fetch(sourceUrl.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000)
    });
  } catch {
    return json({ error: 'source_fetch_failed' }, 502);
  }

  if (!source.ok) return json({ error: 'source_fetch_failed', status: source.status }, 502);

  const mime = normalizeMime(source.headers.get('content-type') || '');
  if (!ALLOWED_MIME.has(mime)) return json({ error: 'unsupported_image_type', mime }, 415);

  const declaredLength = Number(source.headers.get('content-length') || '0');
  if (declaredLength > MAX_BYTES) return json({ error: 'image_too_large' }, 413);

  const bytes = await source.arrayBuffer();
  if (!bytes.byteLength) return json({ error: 'empty_image' }, 422);
  if (bytes.byteLength > MAX_BYTES) return json({ error: 'image_too_large' }, 413);

  const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
  const file = new File([bytes], body.file_name || `manual-chat-hero.${ext}`, { type: mime });
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
      ingest_mode: 'manual_chat_proxy',
      ...(body.generation_metadata || {})
    }
  }));

  const base = (env.MEDIA_INGEST_URL || 'https://morgentidende-media-ingest.morgentidende.workers.dev').replace(/\/$/, '');
  const upstream = await fetch(`${base}/upload`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.CHAT_MEDIA_TOKEN}` },
    body: form,
    signal: AbortSignal.timeout(20_000)
  });

  const text = await upstream.text();
  let result: unknown;
  try { result = text ? JSON.parse(text) : null; } catch { result = { raw: text.slice(0, 1000) }; }
  return json(result, upstream.status);
};
