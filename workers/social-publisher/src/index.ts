interface Env {
  METRICOOL_TOKEN: string;
  METRICOOL_USER_ID: string;
  METRICOOL_BLOG_ID: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
}

type Network = 'facebook' | 'instagram';

type PublishRequest = {
  network: Network;
  text: string;
  publishAt: string;
  timezone?: string;
  mediaUrls?: string[];
  mediaAltText?: string[];
  isAiGenerated?: boolean;
};

const DEFAULT_TIMEZONE = 'Europe/Copenhagen';
const SUPPORTED_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/heic',
  'video/mp4',
  'video/quicktime'
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });

async function authorized(request: Request, env: Env): Promise<boolean> {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return false;

  try {
    const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/authorize_social_adapter_token`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ p_token: token })
    });
    if (!response.ok) return false;
    return (await response.json()) === true;
  } catch {
    return false;
  }
}

const validNetwork = (value: unknown): value is Network =>
  value === 'facebook' || value === 'instagram';

const normalizeMedia = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
};

const validPublicHttpsUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
};

async function mediaContentType(url: string): Promise<string | null> {
  try {
    let response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (!response.ok || !response.headers.get('content-type')) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { range: 'bytes=0-1023' }
      });
    }
    if (!response.ok) return null;
    return response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

async function validateMedia(urls: string[]) {
  for (const url of urls) {
    if (!validPublicHttpsUrl(url)) {
      return { ok: false as const, error: 'media_url_must_be_https', url };
    }

    const contentType = await mediaContentType(url);
    if (!contentType) {
      return { ok: false as const, error: 'media_unreachable', url };
    }

    if (!SUPPORTED_MEDIA_TYPES.includes(contentType)) {
      return { ok: false as const, error: 'unsupported_media_type', url, contentType };
    }
  }

  return { ok: true as const };
}

const localPublicationDate = (publishAt: Date, timezone: string) =>
  publishAt.toLocaleString('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(' ', 'T');

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        service: 'social-publisher',
        networks: ['facebook', 'instagram'],
        provider: 'metricool',
        configured: Boolean(
          env.METRICOOL_TOKEN &&
          env.METRICOOL_USER_ID &&
          env.METRICOOL_BLOG_ID &&
          env.SUPABASE_URL &&
          env.SUPABASE_PUBLISHABLE_KEY
        )
      });
    }

    if (request.method !== 'POST' || url.pathname !== '/schedule') {
      return json({ ok: false, error: 'not_found' }, 404);
    }

    if (!(await authorized(request, env))) {
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

    const timezone = body.timezone?.trim() || DEFAULT_TIMEZONE;
    const mediaUrls = normalizeMedia(body.mediaUrls);
    const mediaAltText = normalizeMedia(body.mediaAltText);

    if (body.network === 'instagram' && mediaUrls.length === 0) {
      return json({ ok: false, error: 'instagram_requires_media' }, 400);
    }

    if (mediaAltText.length > 0 && mediaAltText.length !== mediaUrls.length) {
      return json({ ok: false, error: 'media_alt_text_length_mismatch' }, 400);
    }

    const mediaValidation = await validateMedia(mediaUrls);
    if (!mediaValidation.ok) {
      return json({ ok: false, ...mediaValidation }, 400);
    }

    const payload: Record<string, unknown> = {
      publicationDate: {
        dateTime: localPublicationDate(publishAt, timezone),
        timezone
      },
      text: body.text.trim(),
      providers: [{ network: body.network }],
      autoPublish: true,
      draft: false,
      shortener: false,
      saveExternalMediaFiles: mediaUrls.length > 0
    };

    if (mediaUrls.length > 0) payload.media = mediaUrls;
    if (mediaAltText.length > 0) payload.mediaAltText = mediaAltText;

    if (body.network === 'facebook') {
      payload.facebookData = { type: 'POST' };
    } else {
      payload.instagramData = {
        type: 'POST',
        showReelOnFeed: true,
        isAiGenerated: Boolean(body.isAiGenerated)
      };
    }

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
      return json({
        ok: false,
        error: 'metricool_error',
        provider: 'metricool',
        status: response.status,
        metricool
      }, 502);
    }

    return json({
      ok: true,
      provider: 'metricool',
      network: body.network,
      scheduledFor: body.publishAt,
      metricool
    });
  }
};
