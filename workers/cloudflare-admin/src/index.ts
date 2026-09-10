interface Env {
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  ADMIN_TOKEN: string;
  ALLOWED_WORKERS?: string;
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
  const auth = request.headers.get('authorization') || '';
  return Boolean(env.ADMIN_TOKEN) && safeEqual(auth, `Bearer ${env.ADMIN_TOKEN}`);
};

const cfHeaders = (env: Env, extra: Record<string, string> = {}) => ({
  authorization: `Bearer ${env.CF_API_TOKEN}`,
  'content-type': 'application/json',
  ...extra
});

const allowedWorkerNames = (env: Env) => new Set(
  (env.ALLOWED_WORKERS || 'morgentidende-v4,morgentidende-media-ingest')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

const ensureWorkerAllowed = (env: Env, name: string) => allowedWorkerNames(env).has(name);

const cfFetch = async (env: Env, path: string, init: RequestInit = {}) => {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}${path}`, {
    ...init,
    headers: cfHeaders(env, (init.headers || {}) as Record<string, string>)
  });
  const text = await response.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 1000) }; }
  if (!response.ok) return { ok: false, status: response.status, body };
  return { ok: true, status: response.status, body };
};

const getWorkerTag = async (env: Env, workerName: string) => {
  const result = await cfFetch(env, '/workers/scripts');
  if (!result.ok) return { error: result };
  const rows = (result.body as any)?.result || [];
  const worker = rows.find((row: any) => row.id === workerName);
  if (!worker?.tag) return { error: { status: 404, body: { error: 'worker_not_found' } } };
  return { tag: worker.tag as string };
};

const listTriggers = async (env: Env, workerName: string) => {
  const tagResult = await getWorkerTag(env, workerName);
  if ('error' in tagResult) return tagResult.error;
  return cfFetch(env, `/builds/workers/${encodeURIComponent(tagResult.tag)}/triggers`);
};

const getPreviewTrigger = async (env: Env, workerName: string) => {
  const result = await listTriggers(env, workerName);
  if (!result.ok) return result;
  const triggers = (result.body as any)?.result || [];
  const preview = triggers.find((trigger: any) => {
    const includes = Array.isArray(trigger.branch_includes) ? trigger.branch_includes : [];
    const excludes = Array.isArray(trigger.branch_excludes) ? trigger.branch_excludes : [];
    return includes.includes('*') || excludes.includes('main');
  });
  if (!preview) return { ok: false, status: 404, body: { error: 'preview_trigger_not_found', triggers } };
  return { ok: true, status: 200, body: preview };
};

const repairPreviewTrigger = async (env: Env, workerName: string) => {
  if (workerName !== 'morgentidende-v4') {
    return { ok: false, status: 403, body: { error: 'repair_not_allowed_for_worker' } };
  }
  const current = await getPreviewTrigger(env, workerName);
  if (!current.ok) return current;
  const trigger = current.body as any;
  const triggerUuid = trigger.trigger_uuid;
  if (!triggerUuid) return { ok: false, status: 422, body: { error: 'trigger_uuid_missing' } };

  const patch = {
    trigger_name: trigger.trigger_name || 'Preview Deploy',
    build_command: 'npm run build',
    deploy_command: 'npx wrangler versions upload',
    root_directory: 'v4-frontend',
    branch_includes: ['*'],
    branch_excludes: ['main'],
    path_includes: Array.isArray(trigger.path_includes) && trigger.path_includes.length ? trigger.path_includes : ['*'],
    path_excludes: Array.isArray(trigger.path_excludes) ? trigger.path_excludes : []
  };

  return cfFetch(env, `/builds/triggers/${encodeURIComponent(triggerUuid)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'morgentidende-cloudflare-admin' });
    }

    if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);
    if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) return json({ error: 'cloudflare_credentials_missing' }, 503);

    const match = url.pathname.match(/^\/workers\/([^/]+)\/(triggers|preview-trigger|builds)$/);
    if (request.method === 'GET' && match) {
      const workerName = decodeURIComponent(match[1]);
      const action = match[2];
      if (!ensureWorkerAllowed(env, workerName)) return json({ error: 'worker_not_allowed' }, 403);

      if (action === 'triggers') {
        const result = await listTriggers(env, workerName);
        return json(result.body, result.status);
      }
      if (action === 'preview-trigger') {
        const result = await getPreviewTrigger(env, workerName);
        return json(result.body, result.status);
      }
      if (action === 'builds') {
        const tagResult = await getWorkerTag(env, workerName);
        if ('error' in tagResult) return json(tagResult.error.body, tagResult.error.status);
        const result = await cfFetch(env, `/builds/workers/${encodeURIComponent(tagResult.tag)}/builds`);
        return json(result.body, result.status);
      }
    }

    if (request.method === 'POST' && url.pathname === '/workers/morgentidende-v4/preview-trigger/repair') {
      const result = await repairPreviewTrigger(env, 'morgentidende-v4');
      return json(result.body, result.status);
    }

    const logMatch = url.pathname.match(/^\/builds\/([^/]+)\/logs$/);
    if (request.method === 'GET' && logMatch) {
      const buildUuid = decodeURIComponent(logMatch[1]);
      if (!/^[0-9a-f-]{36}$/i.test(buildUuid)) return json({ error: 'invalid_build_uuid' }, 400);
      const result = await cfFetch(env, `/builds/builds/${encodeURIComponent(buildUuid)}/logs`);
      return json(result.body, result.status);
    }

    return json({ error: 'not_found' }, 404);
  }
};
