interface Env {
  SOCIAL_PUBLISHER_TOKEN: string;
  METRICOOL_TOKEN: string;
  METRICOOL_USER_ID: string;
  METRICOOL_BLOG_ID: string;
}

type Network = 'facebook' | 'instagram' | 'twitter';

type PublishRequest = {
  network: Network;
  text: string;
  publishAt: string;
  timezone?: string;
  mediaUrls?: string[];
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });

const authorized = (request: Request, env: Env) => {
  const token = request.headers.get('x-morgentidende-social-token') || '';
  return Boolean(env.SOCIAL_PUBLISHER_TOKEN && token === env.SOCIAL_PUBLISHER_TOKEN);
};

const validNetwork = (value: unknown): value is Network =>
  value === 'facebook' || value === 'instagram' || value === 'twitter';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'morgentidende-social-publisher', configured: Boolean(env.METRICOOL_TOKEN && env.METRICOOL_USER_ID && env.METRICOOL_BLOG_ID) });
    }

    if (request.method !== 'POST' || url.pathname !== '/schedule') {
      return json({ ok: false, error: 'not_found' }, 404);
    }

    if (!authorized(request, env)) {
      return json({ ok: false, error: 'unauthorized' }, 401);
    }

    let body: PublishRequest;
    try {
      body = await request.json<PublishRequest>();
    } catch {
      return json({ ok: false, error: 'invalid_json' }, 400);
    }

    if (!validNetwork(body.network) || !body.text?.trim() || !body.publishAt) {
      return json({ ok: false, error: 'invalid_request' }, 400);
    }

    if (!env.METRICOOL_TOKEN || !env.METRICOOL_USER_ID || !env.METRICOOL_BLOG_ID) {
      return json({ ok: false, error: 'metricool_not_configured' }, 503);
    }

    const publishAt = new Date(body.publishAt);
    if (Number.isNaN(publishAt.getTime()) || publishAt.getTime() <= Date.now()) {
      return json({ ok: false, error: 'publishAt_must_be_future' }, 400);
    }

    const publicationDate = publishAt.toLocaleString('sv-SE', {
      timeZone: body.timezone || 'Europe/Copenhagen',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).replace(' ', 'T');

    const payload: Record<string, unknown> = {
      publicationDate: {
        dateTime: publicationDate,
        timezone: body.timezone || 'Europe/Copenhagen'
      },
      text: body.text.trim(),
      providers: [{ network: body.network }],
      autoPublish: true,
      draft: false,
      shortener: false,
      saveExternalMediaFiles: Boolean(body.mediaUrls?.length)
    };

    if (body.mediaUrls?.length) payload.media = body.mediaUrls;

    const endpoint = new URL('https://app.metricool.com/api/v2/scheduler/posts');
    endpoint.searchParams.set('blogId', env.METRICOOL_BLOG_ID);
    endpoint.searchParams.set('userId', env.METRICOOL_USER_ID);

    const response = await fetch(endpoint.toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mc-auth': env.METRICOOL_TOKEN
      },
      body: JSON.stringify(payload)
    });

    const raw = await response.text();
    let metricool: unknown = raw;
    try { metricool = JSON.parse(raw); } catch { /* keep raw text */ }

    if (!response.ok) {
      return json({ ok: false, error: 'metricool_error', status: response.status, metricool }, 502);
    }

    return json({ ok: true, metricool });
  }
};
