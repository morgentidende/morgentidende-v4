import worker from './queue-entry';
import baseWorker from './index';
import { maybeHandleSvgChatUpload } from './svg-chat-upload';

interface Env {
  MEDIA_BUCKET: R2Bucket;
  MEDIA_PUBLIC_BASE_URL: string;
  MEDIA_MAX_BYTES?: string;
  MEDIA_INGEST_TOKEN: string;
  OPS_MEDIA_TOKEN?: string;
  CHAT_MEDIA_TOKEN?: string;
  IMAGES: any;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

type ErrorBody = { error?: string; status?: number; http_status?: number };

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const withCanonicalMediaAuth = (request: Request, env: Env) => {
  const auth = request.headers.get('authorization') || '';
  const supplied = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
  const opsToken = env.OPS_MEDIA_TOKEN || '';
  const chatToken = env.CHAT_MEDIA_TOKEN || '';
  const allowed = (opsToken && safeEqual(supplied, opsToken))
    || (chatToken && safeEqual(supplied, chatToken));
  if (!allowed) return request;
  const headers = new Headers(request.headers);
  headers.set('authorization', `Bearer ${env.MEDIA_INGEST_TOKEN}`);
  return new Request(request, { headers });
};

const errorBody = async (response: Response): Promise<ErrorBody> => {
  try { return await response.clone().json<ErrorBody>(); } catch { return {}; }
};

const isTransient = (response: Response, body: ErrorBody) => {
  if (response.status === 202 || response.status >= 500) return true;
  if (body.error !== 'source_fetch_failed') return false;
  const status = Number(body.status || 0);
  return status === 408 || status === 425 || status === 429 || status >= 500;
};

const candidateIsUsable = (candidate: unknown): candidate is Record<string, unknown> => {
  if (!candidate || typeof candidate !== 'object') return false;
  const row = candidate as Record<string, unknown>;
  return typeof row.source_url === 'string'
    && row.source_url.length > 0
    && row.commercial_use_allowed === true
    && row.local_storage_allowed === true;
};

const ingestWithImmediateFallback = async (request: Request, env: Env) => {
  let payload: Record<string, unknown>;
  try { payload = await request.clone().json<Record<string, unknown>>(); }
  catch { return worker.fetch(request, env); }

  let currentRequest = request;
  let currentPayload = payload;
  for (let hop = 0; hop < 6; hop += 1) {
    const response = await worker.fetch(currentRequest, env);
    if (response.ok || response.status === 202) return response;

    const body = await errorBody(response);
    if (isTransient(response, body)) return response;

    const candidates = Array.isArray(currentPayload.fallback_candidates)
      ? currentPayload.fallback_candidates.filter(candidateIsUsable)
      : [];
    if (!candidates.length) return response;

    const [next, ...remaining] = candidates;
    const previousUrl = typeof currentPayload.source_url === 'string' ? currentPayload.source_url : null;
    const priorMetadata = currentPayload.metadata && typeof currentPayload.metadata === 'object'
      ? currentPayload.metadata as Record<string, unknown>
      : {};

    currentPayload = {
      ...currentPayload,
      ...next,
      fallback_candidates: remaining,
      metadata: {
        ...priorMetadata,
        ...((next.metadata && typeof next.metadata === 'object') ? next.metadata as Record<string, unknown> : {}),
        fallback_from_source_url: previousUrl,
        fallback_reason: body.error || `ingest_${response.status}`,
        fallback_hop: hop + 1,
      },
    };

    const headers = new Headers(request.headers);
    headers.set('content-type', 'application/json');
    currentRequest = new Request(request.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(currentPayload),
    });
  }

  return new Response(JSON.stringify({ error: 'hero_fallback_limit_reached' }), {
    status: 422,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const svgResponse = await maybeHandleSvgChatUpload(request, env, baseWorker);
    if (svgResponse) return svgResponse;

    const canonical = withCanonicalMediaAuth(request, env);
    const url = new URL(canonical.url);
    if (canonical.method === 'POST' && url.pathname === '/ingest') {
      return ingestWithImmediateFallback(canonical, env);
    }
    return worker.fetch(canonical, env);
  },

  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    return worker.scheduled(controller, env, ctx);
  },
};
