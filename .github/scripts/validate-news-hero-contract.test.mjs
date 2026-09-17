import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const script = new URL('./validate-news-hero-contract.mjs', import.meta.url);

function candidate(overrides = {}) {
  return {
    source_url: 'https://images.example.org/original.jpg',
    width: 1600,
    height: 900,
    commercial_use_allowed: true,
    local_storage_allowed: true,
    ...overrides,
  };
}

function payload(candidates) {
  return {
    queue_id: 'hero-contract-test',
    slug: 'hero-contract-test',
    headline: 'Hero contract test',
    category_slug: 'udland',
    kind: 'news',
    body_markdown: 'Test.',
    source_metadata: [],
    editorial_metadata: {
      sagen_kort: ['Et.', 'To.'],
      hero_candidates: candidates,
    },
  };
}

function run(value) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-contract-'));
  const file = path.join(dir, 'payload.json');
  fs.writeFileSync(file, JSON.stringify(value));
  try {
    return {
      ok: true,
      output: execFileSync(process.execPath, [script], {
        env: { ...process.env, QUEUE_FILE: file },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (error) {
    return {
      ok: false,
      output: String(error.stderr || error.stdout || error.message),
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('accepts three known large hero candidates', () => {
  const result = run(payload([candidate(), candidate(), candidate()]));
  assert.equal(result.ok, true, result.output);
  assert.match(result.output, /news_hero_contract_ok/);
});

test('rejects a known 640x480 candidate before handoff', () => {
  const result = run(payload([
    candidate({ width: 640, height: 480 }),
    candidate(),
    candidate(),
  ]));
  assert.equal(result.ok, false);
  assert.match(result.output, /known_dimensions_too_small/);
});

test('rejects EU Audiovisual photo landing pages until a resolver exists', () => {
  const result = run(payload([
    candidate({ source_url: 'https://audiovisual.ec.europa.eu/en/media/photo/P-070449/00-16' }),
    candidate(),
    candidate(),
  ]));
  assert.equal(result.ok, false);
  assert.match(result.output, /unsupported_html_landing_page_use_direct_download_url/);
});

test('allows unknown dimensions for final Media Worker verification', () => {
  const withoutDimensions = candidate();
  delete withoutDimensions.width;
  delete withoutDimensions.height;
  const result = run(payload([withoutDimensions, candidate(), candidate()]));
  assert.equal(result.ok, true, result.output);
  assert.match(result.output, /unknown_dimensions=1/);
});
