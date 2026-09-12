import fs from 'node:fs/promises';

const adminBase = process.env.ADMIN_BASE_URL;
const adminToken = process.env.ADMIN_TOKEN?.trim();
const cfToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
const zoneName = (process.env.CLOUDFLARE_ZONE_NAME || 'morgentidende.dk').trim();
const cfBase = 'https://api.cloudflare.com/client/v4';

const raw = await fs.readFile('cloudflare-ops/request.json', 'utf8');
const request = JSON.parse(raw);
const action = request?.action;

async function readJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function cf(path, options = {}) {
  if (!cfToken) throw new Error('Missing CLOUDFLARE_API_TOKEN secret.');
  const response = await fetch(`${cfBase}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${cfToken}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await readJson(response);
  if (!response.ok || body?.success === false) {
    throw new Error(`Cloudflare ${options.method || 'GET'} ${path} failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function getZone() {
  const body = await cf(`/zones?name=${encodeURIComponent(zoneName)}&status=active&per_page=5`);
  const zones = body?.result || [];
  const zone = zones.find((z) => z.name === zoneName) || zones[0];
  if (!zone?.id) throw new Error(`Active Cloudflare zone not found: ${zoneName}`);
  return zone;
}

async function directCloudflareAction() {
  const verify = await cf('/user/tokens/verify');
  const zone = await getZone();

  if (action === 'cf_audit') {
    const [browserCheck, settings, rulesets] = await Promise.all([
      cf(`/zones/${zone.id}/settings/browser_check`),
      cf(`/zones/${zone.id}/settings`),
      cf(`/zones/${zone.id}/rulesets`)
    ]);
    const selectedSettings = (settings.result || [])
      .filter((s) => ['browser_check', 'security_level', 'ssl', 'always_use_https', 'ipv6'].includes(s.id))
      .map((s) => ({ id: s.id, value: s.value, editable: s.editable }));
    console.log(JSON.stringify({
      action,
      token_status: verify?.result?.status,
      zone: { id: zone.id, name: zone.name, status: zone.status },
      browser_check: browserCheck?.result,
      settings: selectedSettings,
      rulesets: (rulesets.result || []).map((r) => ({ id: r.id, name: r.name, kind: r.kind, phase: r.phase }))
    }, null, 2));
    return;
  }

  if (action === 'cf_disable_browser_check') {
    const before = await cf(`/zones/${zone.id}/settings/browser_check`);
    const changed = await cf(`/zones/${zone.id}/settings/browser_check`, {
      method: 'PATCH',
      body: JSON.stringify({ value: 'off' })
    });
    const after = await cf(`/zones/${zone.id}/settings/browser_check`);
    console.log(JSON.stringify({
      action,
      zone: { id: zone.id, name: zone.name },
      before: before?.result,
      changed: changed?.result,
      after: after?.result
    }, null, 2));
    return;
  }

  if (action === 'cf_custom_waf_audit') {
    const rulesets = await cf(`/zones/${zone.id}/rulesets`);
    const custom = (rulesets.result || []).filter((r) => r.phase === 'http_request_firewall_custom');
    const details = [];
    for (const ruleset of custom) {
      const full = await cf(`/zones/${zone.id}/rulesets/${ruleset.id}`);
      details.push({
        id: ruleset.id,
        name: ruleset.name,
        rules: (full?.result?.rules || []).map((r) => ({ id: r.id, action: r.action, enabled: r.enabled, description: r.description, expression: r.expression }))
      });
    }
    console.log(JSON.stringify({ action, zone: { id: zone.id, name: zone.name }, custom_rulesets: details }, null, 2));
    return;
  }

  throw new Error(`Unsupported direct Cloudflare action: ${String(action)}`);
}

if (['cf_audit', 'cf_disable_browser_check', 'cf_custom_waf_audit'].includes(action)) {
  try {
    await directCloudflareAction();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(6);
  }
  process.exit(0);
}

if (!adminBase || !adminToken) {
  console.error('Missing ADMIN_BASE_URL or CLOUDFLARE_ADMIN_TOKEN secret.');
  process.exit(2);
}

const healthResponse = await fetch(`${adminBase}/health`);
const healthText = await healthResponse.text();
console.log(JSON.stringify({ probe: 'health', status: healthResponse.status, body: healthText }, null, 2));

const allowed = {
  diagnostics_summary: { method: 'GET', path: '/diagnostics/summary' },
  exposure_diagnostics: { method: 'GET', path: '/diagnostics/exposure' },
  r2_diagnostics: { method: 'GET', path: '/diagnostics/r2' },
  security_diagnostics: { method: 'GET', path: '/diagnostics/security' },
  preview_trigger: { method: 'GET', path: '/workers/morgentidende-v4/preview-trigger' },
  preview_builds: { method: 'GET', path: '/workers/morgentidende-v4/builds' },
  frontend_triggers: { method: 'GET', path: '/workers/morgentidende-v4/triggers' },
  media_triggers: { method: 'GET', path: '/workers/morgentidende-media-ingest/triggers' },
  zone: { method: 'GET', path: '/zone' },
  zone_dns: { method: 'GET', path: '/zone/dns' },
  zone_settings: { method: 'GET', path: '/zone/settings' },
  zone_rulesets: { method: 'GET', path: '/zone/rulesets' },
  worker_routes: { method: 'GET', path: '/zone/worker-routes' },
  r2_buckets: { method: 'GET', path: '/r2/buckets' },
  email_status: { method: 'GET', path: '/email/status' },
  email_routing_enable: { method: 'POST', path: '/email/routing/enable' },
  email_redaktion_rule: { method: 'POST', path: '/email/routing/redaktion-rule' },
  email_sending_onboard: { method: 'POST', path: '/email/sending/onboard' }
};

let spec = allowed[action];
if (!spec && action === 'build_logs') {
  const uuid = String(request?.build_uuid || '');
  if (!/^[0-9a-f-]{36}$/i.test(uuid)) {
    console.error('Invalid build_uuid.');
    process.exit(3);
  }
  spec = { method: 'GET', path: `/builds/${uuid}/logs` };
}

if (!spec) {
  console.error(`Unsupported action: ${String(action)}`);
  process.exit(4);
}

const response = await fetch(`${adminBase}${spec.path}`, {
  method: spec.method,
  headers: {
    'x-morgentidende-admin-token': adminToken,
    authorization: `Bearer ${adminToken}`,
    'content-type': 'application/json'
  }
});

const body = await readJson(response);
console.log(JSON.stringify({ action, status: response.status, ok: response.ok, result: body }, null, 2));
if (!response.ok) process.exit(5);
