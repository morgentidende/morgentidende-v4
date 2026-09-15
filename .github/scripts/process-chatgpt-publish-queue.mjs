import fs from 'node:fs';
import { normalizePublishKind } from './publish-kind.mjs';

const file = process.env.QUEUE_FILE;
const projectRef = process.env.SUPABASE_PROJECT_REF || 'lfttxjxfggjcxmdfjndk';
const validateOnly = process.env.VALIDATE_ONLY === '1';
const oidcRequestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const oidcRequestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
const audience = 'morgentidende-publish-bridge';

function fail(message) {
  console.error(`publish_bridge_error:${message}`);
  process.exit(1);
}

if (!file) fail('QUEUE_FILE_missing');
if (!fs.existsSync(file)) fail('queue_file_not_found');

let payload;
try {
  payload = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch {
  fail('invalid_json');
}

if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('payload_must_be_object');
for (const key of ['queue_id', 'slug', 'headline', 'category_slug', 'body_markdown']) {
  if (typeof payload[key] !== 'string' || !payload[key].trim()) fail(`${key}_required`);
}
if (!/^[A-Za-z0-9._-]{1,160}$/.test(payload.queue_id)) fail('invalid_queue_id');
if (!/^[a-z0-9][a-z0-9-]{1,179}$/.test(payload.slug)) fail('invalid_slug');
if (payload.source_metadata !== undefined && !Array.isArray(payload.source_metadata)) fail('source_metadata_must_be_array');
if (payload.editorial_metadata !== undefined && (typeof payload.editorial_metadata !== 'object' || Array.isArray(payload.editorial_metadata) || payload.editorial_metadata === null)) fail('editorial_metadata_must_be_object');
if (payload.headline.length > 220) fail('headline_too_long');
if (payload.deck && String(payload.deck).length > 300) fail('deck_too_long');

try {
  const kindResult = normalizePublishKind(payload.kind, payload.category_slug);
  if (kindResult) {
    payload.kind = kindResult.normalizedKind;
    if (kindResult.normalizedKind !== kindResult.originalKind) {
      console.log(`publish_bridge_kind_normalized from=${kindResult.originalKind} to=${kindResult.normalizedKind} category=${payload.category_slug}`);
    }
  }
} catch (error) {
  fail(error instanceof Error ? error.message : 'invalid_article_kind');
}

payload.source_metadata ??= [];
payload.editorial_metadata ??= {};
payload.editorial_metadata = {
  ...payload.editorial_metadata,
  github_transport_file: file,
  github_transport_sha: process.env.GITHUB_HEAD_SHA || process.env.GITHUB_SHA || null,
  github_transport_pr: process.env.PR_NUMBER || null,
};

console.log(`publish_bridge_validated queue_id=${payload.queue_id} slug=${payload.slug}`);
if (validateOnly) process.exit(0);
if (!oidcRequestUrl || !oidcRequestToken) fail('github_oidc_unavailable');

async function getOidcToken() {
  const separator = oidcRequestUrl.includes('?') ? '&' : '?';
  const response = await fetch(`${oidcRequestUrl}${separator}audience=${encodeURIComponent(audience)}`, {
    headers: { Authorization: `Bearer ${oidcRequestToken}` },
  });
  const text = await response.text();
  if (!response.ok) fail(`github_oidc_http_${response.status}:${text.slice(0, 300)}`);
  let parsed;
  try { parsed = JSON.parse(text); } catch { fail('github_oidc_invalid_json'); }
  if (!parsed?.value) fail('github_oidc_token_missing');
  return parsed.value;
}

const endpoint = `https://${projectRef}.supabase.co/functions/v1/chatgpt-publish-bridge`;
const oidcToken = await getOidcToken();

async function callOnce() {
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${oidcToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

let response = await callOnce();
if ([429, 500, 502, 503, 504].includes(response.status)) {
  await new Promise((r) => setTimeout(r, 1200));
  response = await callOnce();
}

const text = await response.text();
if (!response.ok) {
  console.error(`publish_bridge_http_error status=${response.status}`);
  console.error(text.slice(0, 1200));
  process.exit(1);
}

let parsed;
try { parsed = JSON.parse(text); } catch { parsed = text; }
const articleId = parsed?.article_id ?? parsed?.result ?? 'unknown';
console.log(`publish_bridge_ok queue_id=${payload.queue_id} article_id=${typeof articleId === 'string' ? articleId : JSON.stringify(articleId)}`);
