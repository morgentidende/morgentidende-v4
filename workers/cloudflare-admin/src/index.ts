interface Env {
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  CF_AUDIT_TOKEN?: string;
  ADMIN_TOKEN: string;
  ALLOWED_WORKERS?: string;
  ALLOWED_ZONE?: string;
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
  if (!env.ADMIN_TOKEN) return false;
  const dedicatedHeader = request.headers.get('x-morgentidende-admin-token') || '';
  if (safeEqual(dedicatedHeader, env.ADMIN_TOKEN)) return true;
  const auth = request.headers.get('authorization') || '';
  return safeEqual(auth, `Bearer ${env.ADMIN_TOKEN}`);
};

const cfHeaders = (token: string, extra: Record<string, string> = {}) => ({
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
  ...extra
});

const allowedWorkerNames = (env: Env) => new Set(
  (env.ALLOWED_WORKERS || 'morgentidende-v4,morgentidende-media-ingest,morgentidende-cloudflare-admin')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

const allowedZoneName = (env: Env) => (env.ALLOWED_ZONE || 'morgentidende.dk').trim().toLowerCase();
const ensureWorkerAllowed = (env: Env, name: string) => allowedWorkerNames(env).has(name);
const auditToken = (env: Env) => env.CF_AUDIT_TOKEN || env.CF_API_TOKEN;

const cfApiWithToken = async (token: string, path: string, init: RequestInit = {}) => {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: cfHeaders(token, (init.headers || {}) as Record<string, string>)
  });
  const text = await response.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 1000) }; }
  return { ok: response.ok, status: response.status, body };
};

const cfApiRead = (env: Env, path: string, init: RequestInit = {}) =>
  cfApiWithToken(auditToken(env), path, init);

const cfApiWrite = (env: Env, path: string, init: RequestInit = {}) =>
  cfApiWithToken(env.CF_API_TOKEN, path, init);

const accountFetchRead = (env: Env, path: string, init: RequestInit = {}) =>
  cfApiRead(env, `/accounts/${env.CF_ACCOUNT_ID}${path}`, init);

const accountFetchWrite = (env: Env, path: string, init: RequestInit = {}) =>
  cfApiWrite(env, `/accounts/${env.CF_ACCOUNT_ID}${path}`, init);

const getZone = async (env: Env) => {
  const name = allowedZoneName(env);
  const result = await cfApiRead(env, `/zones?name=${encodeURIComponent(name)}&account.id=${encodeURIComponent(env.CF_ACCOUNT_ID)}`);
  if (!result.ok) return { error: result };
  const zones = (result.body as any)?.result || [];
  const zone = zones.find((item: any) => String(item.name || '').toLowerCase() === name);
  if (!zone?.id) return { error: { ok: false, status: 404, body: { error: 'zone_not_found' } } };
  return { id: zone.id as string, zone };
};

const zoneFetchRead = async (env: Env, path: string, init: RequestInit = {}) => {
  const zoneResult = await getZone(env);
  if ('error' in zoneResult) return zoneResult.error;
  return cfApiRead(env, `/zones/${encodeURIComponent(zoneResult.id)}${path}`, init);
};

const zoneFetchWrite = async (env: Env, path: string, init: RequestInit = {}) => {
  const zoneResult = await getZone(env);
  if ('error' in zoneResult) return zoneResult.error;
  return cfApiWrite(env, `/zones/${encodeURIComponent(zoneResult.id)}${path}`, init);
};

const getWorkerTag = async (env: Env, workerName: string) => {
  const result = await accountFetchRead(env, '/workers/scripts');
  if (!result.ok) return { error: result };
  const rows = (result.body as any)?.result || [];
  const worker = rows.find((row: any) => row.id === workerName);
  if (!worker?.tag) return { error: { status: 404, body: { error: 'worker_not_found' } } };
  return { tag: worker.tag as string };
};

const listTriggers = async (env: Env, workerName: string) => {
  const tagResult = await getWorkerTag(env, workerName);
  if ('error' in tagResult) return tagResult.error;
  return accountFetchRead(env, `/builds/workers/${encodeURIComponent(tagResult.tag)}/triggers`);
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

const getExposureDiagnostics = async (env: Env) => {
  const [scripts, domains] = await Promise.all([
    accountFetchRead(env, '/workers/scripts'),
    accountFetchRead(env, '/workers/domains')
  ]);

  const workerRows = Array.isArray((scripts.body as any)?.result)
    ? (scripts.body as any).result.filter((row: any) => String(row?.id || '').startsWith('morgentidende-'))
    : [];

  const subdomains = await Promise.all(workerRows.map(async (row: any) => {
    const name = String(row.id || '');
    const result = await accountFetchRead(env, `/workers/scripts/${encodeURIComponent(name)}/subdomain`);
    return {
      worker: name,
      status: result.status,
      ok: result.ok,
      subdomain: result.body
    };
  }));

  return {
    scripts: scripts.body,
    domains: domains.body,
    subdomains
  };
};

const getSecurityDiagnostics = async (env: Env) => {
  const rulesets = await zoneFetchRead(env, '/rulesets');
  if (!rulesets.ok) return { rulesets: rulesets.body, details: [] };

  const rows = Array.isArray((rulesets.body as any)?.result) ? (rulesets.body as any).result : [];
  const zoneOwned = rows.filter((row: any) => row?.kind === 'zone' && /^[0-9a-f]{32}$/i.test(String(row?.id || '')));
  const details = await Promise.all(zoneOwned.map(async (row: any) => {
    const id = String(row.id);
    const result = await zoneFetchRead(env, `/rulesets/${encodeURIComponent(id)}`);
    return {
      id,
      name: row.name,
      phase: row.phase,
      status: result.status,
      ok: result.ok,
      ruleset: result.body
    };
  }));

  return {
    rulesets: rulesets.body,
    details
  };
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

  return accountFetchWrite(env, `/builds/triggers/${encodeURIComponent(triggerUuid)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch)
  });
};

const SAFE_ZONE_SETTINGS = new Set([
  'always_use_https',
  'automatic_https_rewrites',
  'browser_check',
  'min_tls_version',
  'security_level',
  'tls_1_3'
]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'morgentidende-cloudflare-admin' });
    }

    if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);
    if (!env.CF_ACCOUNT_ID || !auditToken(env)) return json({ error: 'cloudflare_read_credentials_missing' }, 503);

    if (request.method === 'GET' && url.pathname === '/diagnostics/summary') {
      const [scripts, r2, zone, settings, dns, rulesets, routes] = await Promise.all([
        accountFetchRead(env, '/workers/scripts'),
        accountFetchRead(env, '/r2/buckets'),
        getZone(env),
        zoneFetchRead(env, '/settings'),
        zoneFetchRead(env, '/dns_records?per_page=100'),
        zoneFetchRead(env, '/rulesets'),
        zoneFetchRead(env, '/workers/routes')
      ]);
      return json({
        workers: scripts.body,
        r2: r2.body,
        zone: 'error' in zone ? zone.error.body : zone.zone,
        settings: settings.body,
        dns: dns.body,
        rulesets: rulesets.body,
        worker_routes: routes.body
      });
    }

    if (request.method === 'GET' && url.pathname === '/diagnostics/exposure') {
      const result = await getExposureDiagnostics(env);
      return json(result);
    }

    if (request.method === 'GET' && url.pathname === '/diagnostics/security') {
      const result = await getSecurityDiagnostics(env);
      return json(result);
    }

    if (request.method === 'GET' && url.pathname === '/r2/buckets') {
      const result = await accountFetchRead(env, '/r2/buckets');
      return json(result.body, result.status);
    }

    if (request.method === 'GET' && url.pathname === '/zone') {
      const result = await getZone(env);
      return 'error' in result ? json(result.error.body, result.error.status) : json(result.zone);
    }

    if (request.method === 'GET' && url.pathname === '/zone/dns') {
      const result = await zoneFetchRead(env, '/dns_records?per_page=100');
      return json(result.body, result.status);
    }

    if (request.method === 'GET' && url.pathname === '/zone/settings') {
      const result = await zoneFetchRead(env, '/settings');
      return json(result.body, result.status);
    }

    if (request.method === 'GET' && url.pathname === '/zone/rulesets') {
      const result = await zoneFetchRead(env, '/rulesets');
      return json(result.body, result.status);
    }

    if (request.method === 'GET' && url.pathname === '/zone/worker-routes') {
      const result = await zoneFetchRead(env, '/workers/routes');
      return json(result.body, result.status);
    }

    if (request.method === 'PATCH' && url.pathname.startsWith('/zone/settings/')) {
      if (!env.CF_API_TOKEN) return json({ error: 'cloudflare_write_credentials_missing' }, 503);
      const setting = decodeURIComponent(url.pathname.slice('/zone/settings/'.length));
      if (!SAFE_ZONE_SETTINGS.has(setting)) return json({ error: 'setting_not_allowed' }, 403);
      let body: any;
      try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
      if (!body || !Object.prototype.hasOwnProperty.call(body, 'value')) return json({ error: 'value_required' }, 400);
      const result = await zoneFetchWrite(env, `/settings/${encodeURIComponent(setting)}`, {
        method: 'PATCH',
        body: JSON.stringify({ value: body.value })
      });
      return json(result.body, result.status);
    }

    if (request.method === 'POST' && url.pathname === '/zone/cache/purge') {
      if (!env.CF_API_TOKEN) return json({ error: 'cloudflare_write_credentials_missing' }, 503);
      let body: any;
      try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
      const files = Array.isArray(body?.files) ? body.files.filter((value: unknown) => typeof value === 'string').slice(0, 30) : [];
      if (!files.length) return json({ error: 'files_required', note: 'Only explicit URL purges are allowed; purge_everything is intentionally disabled.' }, 400);
      const allowedHost = allowedZoneName(env);
      for (const value of files) {
        try {
          const candidate = new URL(value);
          if (candidate.protocol !== 'https:' || !(candidate.hostname === allowedHost || candidate.hostname.endsWith(`.${allowedHost}`))) {
            return json({ error: 'url_not_allowed', url: value }, 403);
          }
        } catch { return json({ error: 'invalid_url', url: value }, 400); }
      }
      const result = await zoneFetchWrite(env, '/purge_cache', {
        method: 'POST',
        body: JSON.stringify({ files })
      });
      return json(result.body, result.status);
    }

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
        const result = await accountFetchRead(env, `/builds/workers/${encodeURIComponent(tagResult.tag)}/builds`);
        return json(result.body, result.status);
      }
    }

    if (request.method === 'POST' && url.pathname === '/workers/morgentidende-v4/preview-trigger/repair') {
      if (!env.CF_API_TOKEN) return json({ error: 'cloudflare_write_credentials_missing' }, 503);
      const result = await repairPreviewTrigger(env, 'morgentidende-v4');
      return json(result.body, result.status);
    }

    const logMatch = url.pathname.match(/^\/builds\/([^/]+)\/logs$/);
    if (request.method === 'GET' && logMatch) {
      const buildUuid = decodeURIComponent(logMatch[1]);
      if (!/^[0-9a-f-]{36}$/i.test(buildUuid)) return json({ error: 'invalid_build_uuid' }, 400);
      const result = await accountFetchRead(env, `/builds/builds/${encodeURIComponent(buildUuid)}/logs`);
      return json(result.body, result.status);
    }

    return json({ error: 'not_found' }, 404);
  }
};
