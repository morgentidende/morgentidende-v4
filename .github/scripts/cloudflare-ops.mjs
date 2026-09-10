import fs from 'node:fs/promises';

const base = process.env.ADMIN_BASE_URL;
const token = process.env.ADMIN_TOKEN;
if (!base || !token) {
  console.error('Missing ADMIN_BASE_URL or CLOUDFLARE_ADMIN_TOKEN secret.');
  process.exit(2);
}

const raw = await fs.readFile('cloudflare-ops/request.json', 'utf8');
const request = JSON.parse(raw);
const action = request?.action;

const allowed = {
  diagnostics_summary: { method: 'GET', path: '/diagnostics/summary' },
  preview_trigger: { method: 'GET', path: '/workers/morgentidende-v4/preview-trigger' },
  preview_builds: { method: 'GET', path: '/workers/morgentidende-v4/builds' },
  repair_preview: { method: 'POST', path: '/workers/morgentidende-v4/preview-trigger/repair' },
  zone: { method: 'GET', path: '/zone' },
  zone_dns: { method: 'GET', path: '/zone/dns' },
  zone_settings: { method: 'GET', path: '/zone/settings' },
  zone_rulesets: { method: 'GET', path: '/zone/rulesets' },
  worker_routes: { method: 'GET', path: '/zone/worker-routes' },
  r2_buckets: { method: 'GET', path: '/r2/buckets' }
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

const response = await fetch(`${base}${spec.path}`, {
  method: spec.method,
  headers: {
    'x-morgentidende-admin-token': token,
    'content-type': 'application/json'
  }
});

const text = await response.text();
let body;
try { body = JSON.parse(text); } catch { body = { raw: text }; }

console.log(JSON.stringify({
  action,
  status: response.status,
  ok: response.ok,
  result: body
}, null, 2));

if (!response.ok) process.exit(5);
