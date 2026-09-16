import fs from 'node:fs';
import { normalizePublishKind } from './publish-kind.mjs';
import { validatePublishPayloadShape } from './publish-payload-shape.mjs';

const file = process.env.QUEUE_FILE;
const projectRef = process.env.SUPABASE_PROJECT_REF || 'lfttxjxfggjcxmdfjndk';
const validateOnly = process.env.VALIDATE_ONLY === '1';
const oidcRequestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const oidcRequestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
const audience = 'morgentidende-publish-bridge';
const allowedMagazineStoryKinds = new Set(['evergreen_explainer', 'followup', 'new_study', 'update']);
const allowedFollowupReasons = new Set(['new_fact', 'official_response', 'arrest', 'new_data', 'court_decision', 'material_update']);
const allowedSourceClassifications = new Set(['authoritative', 'discovery_only']);

function fail(message) {
  console.error(`publish_bridge_error:${message}`);
  process.exit(1);
}

function validateSourceRegistryUpdates(updates) {
  if (updates === undefined) return;
  if (!Array.isArray(updates)) fail('source_registry_updates_must_be_array');
  if (updates.length > 50) fail('source_registry_updates_too_many');
  for (const item of updates) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('source_registry_update_must_be_object');
    const domain = String(item.domain ?? item.url ?? '').trim();
    const name = String(item.source_name ?? item.publisher ?? '').trim();
    const classification = String(item.classification ?? '').trim().toLowerCase();
    if (!domain) fail('source_registry_domain_required');
    if (!name) fail('source_registry_name_required');
    if (!allowedSourceClassifications.has(classification)) fail('invalid_source_registry_classification');
    item.classification = classification;
  }
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
const payloadType = String(payload.payload_type ?? 'article').trim().toLowerCase();
if (!['article', 'discovery_audit'].includes(payloadType)) fail('invalid_payload_type');
payload.payload_type = payloadType;

if (typeof payload.queue_id !== 'string' || !payload.queue_id.trim()) fail('queue_id_required');
if (!/^[A-Za-z0-9._-]{1,160}$/.test(payload.queue_id)) fail('invalid_queue_id');
validateSourceRegistryUpdates(payload.source_registry_updates);

if (payloadType === 'discovery_audit') {
  if (payload.run_id !== undefined && (typeof payload.run_id !== 'string' || !payload.run_id.trim())) fail('invalid_run_id');
  if (!Array.isArray(payload.discovery_audit)) fail('discovery_audit_candidates_must_be_array');
  if (payload.discovery_audit.length > 50) fail('discovery_audit_too_many_candidates');
  for (const item of payload.discovery_audit) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('discovery_audit_candidate_must_be_object');
  }
} else {
  for (const key of ['slug', 'headline', 'category_slug', 'body_markdown']) {
    if (typeof payload[key] !== 'string' || !payload[key].trim()) fail(`${key}_required`);
  }
  if (!/^[a-z0-9][a-z0-9-]{1,179}$/.test(payload.slug)) fail('invalid_slug');
  if (payload.source_metadata !== undefined && !Array.isArray(payload.source_metadata)) fail('source_metadata_must_be_array');
  if (payload.editorial_metadata !== undefined && (typeof payload.editorial_metadata !== 'object' || Array.isArray(payload.editorial_metadata) || payload.editorial_metadata === null)) fail('editorial_metadata_must_be_object');
  if (payload.headline.length > 220) fail('headline_too_long');
  if (payload.deck && String(payload.deck).length > 300) fail('deck_too_long');

  try {
    validatePublishPayloadShape(payload);
  } catch (error) {
    fail(error instanceof Error ? error.message : 'invalid_payload_shape');
  }

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

  if (payload.editorial_metadata.discovery_audit !== undefined) {
    if (!Array.isArray(payload.editorial_metadata.discovery_audit)) fail('discovery_audit_candidates_must_be_array');
    if (payload.editorial_metadata.discovery_audit.length > 50) fail('discovery_audit_too_many_candidates');
  }

  if (payload.kind === 'magazine') {
    const topicKey = String(payload.editorial_metadata.topic_key ?? '').trim();
    if (!topicKey) fail('magazine_topic_key_required');

    const storyKind = String(payload.editorial_metadata.story_kind ?? 'evergreen_explainer').trim();
    if (!allowedMagazineStoryKinds.has(storyKind)) fail('magazine_story_kind_invalid');
    payload.editorial_metadata.story_kind = storyKind;

    if (storyKind === 'followup') {
      const parentId = String(payload.editorial_metadata.followup_parent_article_id ?? '').trim();
      const reason = String(payload.editorial_metadata.followup_reason ?? '').trim();
      if (!parentId) fail('followup_requires_parent');
      if (!allowedFollowupReasons.has(reason)) fail('followup_requires_reason');
      const hasCluster = (
        (typeof payload.story_cluster_id === 'string' && payload.story_cluster_id.trim())
        || (typeof payload.story_cluster_key === 'string' && payload.story_cluster_key.trim())
      );
      if (!hasCluster) fail('followup_requires_cluster');
    }
  }

  payload.editorial_metadata = {
    ...payload.editorial_metadata,
    github_transport_file: file,
    github_transport_sha: process.env.GITHUB_HEAD_SHA || process.env.GITHUB_SHA || null,
    github_transport_pr: process.env.PR_NUMBER || null,
  };
}

console.log(`publish_bridge_validated type=${payloadType} queue_id=${payload.queue_id}${payload.slug ? ` slug=${payload.slug}` : ''}`);
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
if (payloadType === 'discovery_audit') {
  console.log(`publish_bridge_audit_ok queue_id=${payload.queue_id} audit_count=${parsed?.audit_count ?? parsed?.result ?? 'unknown'}`);
} else {
  const articleId = parsed?.article_id ?? parsed?.result ?? 'unknown';
  console.log(`publish_bridge_ok queue_id=${payload.queue_id} article_id=${typeof articleId === 'string' ? articleId : JSON.stringify(articleId)}`);
}
