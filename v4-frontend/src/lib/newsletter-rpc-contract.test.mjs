import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const sql = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations/20260916120000_newsletter_mark_confirmation_sent.sql'),
  'utf8'
);

const beginDrop = "drop function if exists public.newsletter_begin_signup(text, text, text, text, text);";
const beginCreate = 'create or replace function public.newsletter_begin_signup(';

test('changing begin_signup return type drops the old function first without CASCADE', () => {
  assert.match(sql, /drop function if exists public\.newsletter_begin_signup\(text, text, text, text, text\);/i);
  assert.doesNotMatch(sql, /cascade/i);
  assert.ok(sql.toLowerCase().indexOf(beginDrop) < sql.indexOf(beginCreate));
});

test('begin_signup returns an internal reservation id with the DOI token', () => {
  assert.match(sql, /returns table\(confirmation_token text, confirmation_expires_at timestamptz, reservation_id uuid\)/);
  assert.match(sql, /v_reservation := gen_random_uuid\(\)/);
  assert.match(sql, /confirmation_reservation_id = excluded.confirmation_reservation_id/);
});

test('mark and release are compare-and-set on reservation id', () => {
  assert.match(sql, /and confirmation_reservation_id = p_reservation_id/);
  assert.equal((sql.match(/and confirmation_reservation_id = p_reservation_id/g) || []).length, 2);
  assert.match(sql, /p_reservation_id uuid/);
});

test('failed or crashed send can be retried after 45s without holding a DB transaction over SES', () => {
  assert.match(sql, /interval '45 seconds'/);
  assert.match(sql, /function public.newsletter_release_confirmation_reservation/);
});
