interface EmailEnv {
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  ADMIN_TOKEN: string;
  ALLOWED_ZONE?: string;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const authorized = (request: Request, env: EmailEnv) => {
  if (!env.ADMIN_TOKEN) return false;
  const dedicated = request.headers.get('x-morgentidende-admin-token') || '';
  if (safeEqual(dedicated, env.ADMIN_TOKEN)) return true;
  return safeEqual(request.headers.get('authorization') || '', `Bearer ${env.ADMIN_TOKEN}`);
};

const zoneName = (env: EmailEnv) => (env.ALLOWED_ZONE || 'morgentidende.dk').trim().toLowerCase();

const cf = async (env: EmailEnv, path: string, init: RequestInit = {}) => {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.CF_API_TOKEN}`,
      'content-type': 'application/json',
      ...((init.headers || {}) as Record<string, string>)
    }
  });
  const text = await response.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 1000) }; }
  return { ok: response.ok, status: response.status, body };
};

const getZone = async (env: EmailEnv) => {
  const name = zoneName(env);
  const result = await cf(env, `/zones?name=${encodeURIComponent(name)}&account.id=${encodeURIComponent(env.CF_ACCOUNT_ID)}`);
  const rows = (result.body as any)?.result || [];
  const zone = rows.find((row: any) => String(row?.name || '').toLowerCase() === name);
  return result.ok && zone?.id
    ? { ok: true as const, id: String(zone.id) }
    : { ok: false as const, status: result.status || 404, body: result.body };
};

export const handleEmailOps = async (request: Request, env: EmailEnv): Promise<Response | null> => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/email/')) return null;
  if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) return json({ error: 'cloudflare_credentials_missing' }, 503);

  const zone = await getZone(env);
  if (!zone.ok) return json(zone.body, zone.status);
  const zoneBase = `/zones/${encodeURIComponent(zone.id)}`;

  if (request.method === 'GET' && url.pathname === '/email/status') {
    const [addresses, routing, rules, sending] = await Promise.all([
      cf(env, `/accounts/${env.CF_ACCOUNT_ID}/email/routing/addresses?per_page=100`),
      cf(env, `${zoneBase}/email/routing`),
      cf(env, `${zoneBase}/email/routing/rules?per_page=100`),
      cf(env, `${zoneBase}/email/sending/subdomains`)
    ]);
    const addressRows = Array.isArray((addresses.body as any)?.result) ? (addresses.body as any).result : [];
    return json({
      routing: { status: routing.status, body: routing.body },
      rules: { status: rules.status, body: rules.body },
      destinations: addressRows.map((row: any) => ({ id: row.id, email: row.email, verified: row.verified })),
      sending: { status: sending.status, body: sending.body }
    });
  }

  if (request.method === 'POST' && url.pathname === '/email/routing/enable') {
    const result = await cf(env, `${zoneBase}/email/routing/dns`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    return json(result.body, result.status);
  }

  if (request.method === 'POST' && url.pathname === '/email/routing/redaktion-rule') {
    const addresses = await cf(env, `/accounts/${env.CF_ACCOUNT_ID}/email/routing/addresses?per_page=100`);
    if (!addresses.ok) return json(addresses.body, addresses.status);
    const verified = ((addresses.body as any)?.result || []).filter((row: any) => row?.email && row?.verified);
    if (verified.length !== 1) {
      return json({
        error: 'expected_exactly_one_verified_destination',
        count: verified.length,
        destinations: verified.map((row: any) => ({ id: row.id, email: row.email }))
      }, 409);
    }
    const destination = String(verified[0].email);
    const local = `redaktion@${zoneName(env)}`;

    const existing = await cf(env, `${zoneBase}/email/routing/rules?per_page=100`);
    const rows = Array.isArray((existing.body as any)?.result) ? (existing.body as any).result : [];
    const found = rows.find((rule: any) => Array.isArray(rule?.matchers) && rule.matchers.some((m: any) => m?.type === 'literal' && m?.field === 'to' && String(m?.value || '').toLowerCase() === local));
    if (found) return json({ ok: true, existing: true, rule: found });

    const result = await cf(env, `${zoneBase}/email/routing/rules`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Morgentidende redaktion',
        enabled: true,
        matchers: [{ type: 'literal', field: 'to', value: local }],
        actions: [{ type: 'forward', value: [destination] }]
      })
    });
    return json(result.body, result.status);
  }

  if (request.method === 'POST' && url.pathname === '/email/sending/onboard') {
    const result = await cf(env, `${zoneBase}/email/sending/subdomains`, {
      method: 'POST',
      body: JSON.stringify({ name: zoneName(env) })
    });
    return json(result.body, result.status);
  }

  return json({ error: 'not_found' }, 404);
};
