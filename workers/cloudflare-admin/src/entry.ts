import app from './index';

const shortFingerprint = async (value: string) => {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .slice(0, 6)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export default {
  async fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext): Promise<Response> {
    const normalizedAdminToken = typeof env.ADMIN_TOKEN === 'string' ? env.ADMIN_TOKEN.trim() : '';
    const normalizedEnv = {
      ...env,
      ADMIN_TOKEN: normalizedAdminToken || env.ADMIN_TOKEN
    };

    const headers = new Headers(request.headers);
    const dedicated = headers.get('x-morgentidende-admin-token');
    if (dedicated !== null) headers.set('x-morgentidende-admin-token', dedicated.trim());
    const authorization = headers.get('authorization');
    if (authorization !== null) headers.set('authorization', authorization.trim());

    const normalizedRequest = new Request(request, { headers });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, service: 'morgentidende-cloudflare-admin', build: 'auth-fingerprint-20260910' }), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
      });
    }

    if (request.method === 'GET' && url.pathname === '/auth-fingerprint-temp') {
      return new Response(JSON.stringify({
        present: Boolean(normalizedAdminToken),
        length: normalizedAdminToken.length,
        fingerprint: normalizedAdminToken ? await shortFingerprint(normalizedAdminToken) : null
      }), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
      });
    }

    return app.fetch(normalizedRequest, normalizedEnv as never, ctx as never);
  }
};
