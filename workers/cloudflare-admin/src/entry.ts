import app from './index';

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const isAuthorized = (request: Request, env: Record<string, unknown>) => {
  const adminToken = typeof env.ADMIN_TOKEN === 'string' ? env.ADMIN_TOKEN.trim() : '';
  if (!adminToken) return false;
  const dedicated = (request.headers.get('x-morgentidende-admin-token') || '').trim();
  if (safeEqual(dedicated, adminToken)) return true;
  const bearer = (request.headers.get('authorization') || '').trim();
  return safeEqual(bearer, `Bearer ${adminToken}`);
};

const cfCall = async (env: Record<string, unknown>, path: string, init: RequestInit = {}) => {
  const accountId = typeof env.CF_ACCOUNT_ID === 'string' ? env.CF_ACCOUNT_ID.trim() : '';
  const token = typeof env.CF_API_TOKEN === 'string' ? env.CF_API_TOKEN.trim() : '';
  if (!accountId || !token) return { ok: false, status: 503, body: { error: 'cloudflare_write_credentials_missing' } };
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    }
  });
  const text = await response.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 1000) }; }
  return { ok: response.ok, status: response.status, body };
};

const disableLegacyV3 = async (env: Record<string, unknown>) => {
  const workers = ['morgentidende-v3', 'morgentidende-v3-scan'];
  const results = [];
  for (const worker of workers) {
    const encoded = encodeURIComponent(worker);
    const schedules = await cfCall(env, `/workers/scripts/${encoded}/schedules`, {
      method: 'PUT',
      body: JSON.stringify([])
    });
    const subdomain = await cfCall(env, `/workers/scripts/${encoded}/subdomain`, { method: 'DELETE' });
    results.push({ worker, schedules, subdomain });
  }
  return results;
};

export default {
  async fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext): Promise<Response> {
    const normalizedEnv = {
      ...env,
      ADMIN_TOKEN: typeof env.ADMIN_TOKEN === 'string' ? env.ADMIN_TOKEN.trim() : env.ADMIN_TOKEN
    };

    const headers = new Headers(request.headers);
    const dedicated = headers.get('x-morgentidende-admin-token');
    if (dedicated !== null) headers.set('x-morgentidende-admin-token', dedicated.trim());
    const authorization = headers.get('authorization');
    if (authorization !== null) headers.set('authorization', authorization.trim());

    const normalizedRequest = new Request(request, { headers });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'morgentidende-cloudflare-admin', build: 'auth-normalize-20260910' }), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
      });
    }

    if (request.method === 'POST' && url.pathname === '/maintenance/disable-legacy-v3') {
      if (!isAuthorized(normalizedRequest, normalizedEnv)) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
      }
      const result = await disableLegacyV3(normalizedEnv);
      const ok = result.every((row) => row.schedules.ok && row.subdomain.ok);
      return new Response(JSON.stringify({ ok, result }), {
        status: ok ? 200 : 502,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
      });
    }

    return app.fetch(normalizedRequest, normalizedEnv as never, ctx as never);
  }
};
