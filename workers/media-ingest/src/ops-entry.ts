import worker from './queue-entry';

interface Env {
  MEDIA_BUCKET: R2Bucket;
  MEDIA_PUBLIC_BASE_URL: string;
  MEDIA_MAX_BYTES?: string;
  MEDIA_INGEST_TOKEN: string;
  OPS_MEDIA_TOKEN?: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const withCanonicalMediaAuth = (request: Request, env: Env) => {
  const opsToken = env.OPS_MEDIA_TOKEN || '';
  if (!opsToken) return request;

  const auth = request.headers.get('authorization') || '';
  const expected = `Bearer ${opsToken}`;
  if (!safeEqual(auth, expected)) return request;

  const headers = new Headers(request.headers);
  headers.set('authorization', `Bearer ${env.MEDIA_INGEST_TOKEN}`);
  return new Request(request, { headers });
};

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return worker.fetch(withCanonicalMediaAuth(request, env), env);
  },

  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    return worker.scheduled(controller, env, ctx);
  },
};
