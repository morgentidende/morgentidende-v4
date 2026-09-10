import app from './index';

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const isAuthorized = (request: Request, env: Record<string, unknown>) => {
  const token = typeof env.ADMIN_TOKEN === 'string' ? env.ADMIN_TOKEN.trim() : '';
  if (!token) return false;
  const dedicated = (request.headers.get('x-morgentidende-admin-token') || '').trim();
  if (safeEqual(dedicated, token)) return true;
  const bearer = (request.headers.get('authorization') || '').trim();
  return safeEqual(bearer, `Bearer ${token}`);
};

const repairSearchRateLimit = async (env: Record<string, unknown>) => {
  const token = typeof env.CF_API_TOKEN === 'string' ? env.CF_API_TOKEN.trim() : '';
  if (!token) return { ok: false, status: 503, body: { error: 'cloudflare_write_credentials_missing' } };

  const zoneId = '409a4c4f6af7e63326670e4f2dc517e5';
  const rulesetId = '90f7cc731c494500b3b96583b3d8122a';
  const ruleId = '7358a2cdb9634476886ea99e69b362cd';
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets/${rulesetId}/rules/${ruleId}`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      action: 'block',
      description: 'Rate limit search abuse',
      enabled: true,
      expression: '(http.request.uri.path eq "/soeg")',
      ratelimit: {
        characteristics: ['ip.src', 'cf.colo.id'],
        period: 10,
        requests_per_period: 10,
        mitigation_timeout: 10
      }
    })
  });
  const text = await response.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 1000) }; }
  return { ok: response.ok, status: response.status, body };
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

    if (request.method === 'POST' && url.pathname === '/maintenance/repair-search-rate-limit') {
      if (!isAuthorized(normalizedRequest, normalizedEnv)) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
      }
      const result = await repairSearchRateLimit(normalizedEnv);
      return new Response(JSON.stringify(result.body), {
        status: result.status,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
      });
    }

    return app.fetch(normalizedRequest, normalizedEnv as never, ctx as never);
  }
};
