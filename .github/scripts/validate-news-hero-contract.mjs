import fs from 'node:fs';
import { normalizePublishKind } from './publish-kind.mjs';

const file = process.env.QUEUE_FILE;
const HERO_MIN_WIDTH = 800;
const HERO_MIN_HEIGHT = 450;
const HERO_PREFERRED_WIDTH = 1200;
const HERO_PREFERRED_HEIGHT = 675;

function fail(message) {
  console.error(`news_hero_contract_error:${message}`);
  process.exit(1);
}

function isKnownUnsupportedLandingPage(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const isEuAudiovisual = host === 'audiovisual.ec.europa.eu'
      || host === 'acceptance.audiovisual.ec.europa.eu';
    return isEuAudiovisual && /^\/[^/]*\/?media\/photo\//i.test(url.pathname.replace(/^\//, '/'));
  } catch {
    return false;
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

let knownPreferred = 0;
let unknownDimensions = 0;

for (const [index, candidate] of candidates.entries()) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) fail(`news_hero_candidate_${index + 1}_must_be_object`);
  if (typeof candidate.source_url !== 'string' || !candidate.source_url.trim()) fail(`news_hero_candidate_${index + 1}_source_url_required`);
  if (candidate.commercial_use_allowed !== true) fail(`news_hero_candidate_${index + 1}_commercial_rights_required`);
  if (candidate.local_storage_allowed !== true) fail(`news_hero_candidate_${index + 1}_storage_rights_required`);

  const sourceUrl = candidate.source_url.trim();
  if (isKnownUnsupportedLandingPage(sourceUrl)) {
    fail(`news_hero_candidate_${index + 1}_unsupported_html_landing_page_use_direct_download_url`);
  }

  const hasWidth = candidate.width !== undefined && candidate.width !== null;
  const hasHeight = candidate.height !== undefined && candidate.height !== null;
  if (hasWidth !== hasHeight) fail(`news_hero_candidate_${index + 1}_dimensions_must_be_paired`);
  if (hasWidth && hasHeight) {
    const width = Number(candidate.width);
    const height = Number(candidate.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      fail(`news_hero_candidate_${index + 1}_invalid_dimensions`);
    }
    if (width < HERO_MIN_WIDTH || height < HERO_MIN_HEIGHT) {
      fail(`news_hero_candidate_${index + 1}_known_dimensions_too_small`);
    }
    if (width >= HERO_PREFERRED_WIDTH && height >= HERO_PREFERRED_HEIGHT) knownPreferred += 1;
  } else {
    unknownDimensions += 1;
  }
}

if (candidates.length < 3) {
  const exception = metadata.hero_exception;
  const reason = exception && typeof exception === 'object' && !Array.isArray(exception)
    ? String(exception.reason ?? '').trim()
    : '';
  if (!reason) fail('news_hero_minimum_3_or_exception_required');
  console.log(`news_hero_contract_exception candidates=${candidates.length} reason=${reason.slice(0, 160)}`);
}

if (knownPreferred === 0 && unknownDimensions > 0) {
  console.log(`news_hero_contract_notice no_known_1200x675_candidate unknown_dimensions=${unknownDimensions}`);
}

console.log(`news_hero_contract_ok candidates=${candidates.length} known_preferred=${knownPreferred} unknown_dimensions=${unknownDimensions}`);
