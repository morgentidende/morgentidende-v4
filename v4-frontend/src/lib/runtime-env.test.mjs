import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const runtimeEnv = readFileSync(resolve(here, 'runtime-env.ts'), 'utf8');
const factory = readFileSync(resolve(here, 'v4-supabase-server.ts'), 'utf8');
const envExample = readFileSync(resolve(here, '../../.env.example'), 'utf8');
const readme = readFileSync(resolve(here, '../../../README.md'), 'utf8');

test('runtime env reads SUPABASE_SECRET_KEY, not SERVICE_ROLE_KEY', () => {
  assert.match(runtimeEnv, /pick\(runtime, 'SUPABASE_SECRET_KEY'\)/);
  assert.doesNotMatch(runtimeEnv, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(runtimeEnv, /supabaseSecretKey/);
});

test('supabase factory uses supabaseSecretKey from runtime env', () => {
  assert.match(factory, /env\.supabaseSecretKey/);
  assert.doesNotMatch(factory, /supabaseServiceRoleKey/);
  assert.doesNotMatch(factory, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('.env.example documents SUPABASE_SECRET_KEY as the Worker secret', () => {
  assert.match(envExample, /^SUPABASE_SECRET_KEY=/m);
  assert.doesNotMatch(envExample, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('README names the Cloudflare runtime variables', () => {
  assert.match(readme, /SUPABASE_SECRET_KEY/);
  assert.match(readme, /PUBLIC_SUPABASE_URL/);
  assert.match(readme, /SUPABASE_SERVICE_ROLE_KEY/);
});
