import fs from 'node:fs';
import { normalizePublishKind } from './publish-kind.mjs';

const file = process.env.QUEUE_FILE;

function fail(message) {
  console.error(`news_hero_contract_error:${message}`);
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
if (String(payload.payload_type ?? 'article').trim().toLowerCase() !== 'article') process.exit(0);

let normalizedKind;
try {
  normalizedKind = normalizePublishKind(payload.kind, payload.category_slug)?.normalizedKind ?? 'news';
} catch (error) {
  fail(error instanceof Error ? error.message : 'invalid_article_kind');
}

if (normalizedKind !== 'news') process.exit(0);

const metadata = payload.editorial_metadata;
if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) fail('editorial_metadata_required');

const candidates = metadata.hero_candidates;
if (!Array.isArray(candidates)) fail('news_hero_candidates_required');
if (candidates.length === 0) fail('news_hero_candidates_empty');
if (candidates.length > 6) fail('news_hero_candidates_too_many');

for (const [index, candidate] of candidates.entries()) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) fail(`news_hero_candidate_${index + 1}_must_be_object`);
  if (typeof candidate.source_url !== 'string' || !candidate.source_url.trim()) fail(`news_hero_candidate_${index + 1}_source_url_required`);
  if (candidate.commercial_use_allowed !== true) fail(`news_hero_candidate_${index + 1}_commercial_rights_required`);
  if (candidate.local_storage_allowed !== true) fail(`news_hero_candidate_${index + 1}_storage_rights_required`);
}

if (candidates.length < 3) {
  const exception = metadata.hero_exception;
  const reason = exception && typeof exception === 'object' && !Array.isArray(exception)
    ? String(exception.reason ?? '').trim()
    : '';
  if (!reason) fail('news_hero_minimum_3_or_exception_required');
  console.log(`news_hero_contract_exception candidates=${candidates.length} reason=${reason.slice(0, 160)}`);
}

console.log(`news_hero_contract_ok candidates=${candidates.length}`);
