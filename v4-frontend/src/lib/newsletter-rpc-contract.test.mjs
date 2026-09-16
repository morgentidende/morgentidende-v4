import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const sql = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations/20260916120000_newsletter_mark_confirmation_sent.sql'),
  'utf8'
);

test('begin_signup reserves the minted token before returning', () => {
  assert.match(sql, /confirmation_send_state = 'reserved'/);
  assert.match(sql, /confirmation_reserved_at = now\(\)/);
  assert.match(sql, /raise exception 'signup_in_flight'/);
  assert.match(sql, /interval '45 seconds'/);
});

test('failed or crashed send can be retried without holding a DB transaction over SES', () => {
  assert.match(sql, /function public.newsletter_release_confirmation_reservation/);
  assert.match(sql, /confirmation_send_state = 'idle'/);
  assert.match(sql, /confirmation_reserved_at <= now\(\) - interval '45 seconds'/);
});

test('active subscribers remain a no-op', () => {
  const beginFn = sql.slice(
    sql.indexOf('create or replace function public.newsletter_begin_signup'),
    sql.indexOf('create or replace function public.newsletter_mark_confirmation_sent')
  );
  assert.ok(beginFn.indexOf("if v_status = 'active'") < beginFn.indexOf('insert into public.newsletter_subscribers'));
});
