import fs from 'node:fs';

const file = process.env.QUEUE_FILE;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF || 'lfttxjxfggjcxmdfjndk';
const validateOnly = process.env.VALIDATE_ONLY === '1';

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
if (!/^[a-z0-9][a-z0-9-]{1,179}$/.test(payload.slug)) fail('invalid_slug');
if (payload.source_metadata !== undefined && !Array.isArray(payload.source_metadata)) fail('source_metadata_must_be_array');
if (payload.editorial_metadata !== undefined && (typeof payload.editorial_metadata !== 'object' || Array.isArray(payload.editorial_metadata) || payload.editorial_metadata === null)) fail('editorial_metadata_must_be_object');
if (payload.headline.length > 220) fail('headline_too_long');
if (payload.deck && String(payload.deck).length > 300) fail('deck_too_long');

payload.source_metadata ??= [];
payload.editorial_metadata ??= {};
payload.editorial_metadata = {
  ...payload.editorial_metadata,
  github_transport_file: file,
  github_transport_sha: process.env.GITHUB_SHA || null,
  github_transport_pr: process.env.PR_NUMBER || null,
};

console.log(`publish_bridge_validated queue_id=${payload.queue_id} slug=${payload.slug}`);
if (validateOnly) process.exit(0);
if (!token) fail('SUPABASE_ACCESS_TOKEN_missing');

const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
const requestBody = {
  query: 'select public.ingest_github_publish_payload($1::jsonb) as article_id',
  parameters: [JSON.stringify(payload)],
  read_only: false,
};

async function callOnce() {
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
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
const articleId = Array.isArray(parsed) ? parsed?.[0]?.article_id : parsed?.article_id;
console.log(`publish_bridge_ok queue_id=${payload.queue_id} article_id=${articleId ?? 'unknown'}`);
