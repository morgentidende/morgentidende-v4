import app from './index';
import { handleEmailOps } from './email-ops';

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
      return new Response(JSON.stringify({ ok: true, service: 'morgentidende-cloudflare-admin', build: 'email-ops-20260911' }), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
      });
    }

    const emailResponse = await handleEmailOps(normalizedRequest, normalizedEnv as never);
    if (emailResponse) return emailResponse;

    return app.fetch(normalizedRequest, normalizedEnv as never, ctx as never);
  }
};
