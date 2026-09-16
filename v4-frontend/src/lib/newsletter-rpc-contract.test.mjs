import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const sql = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations/20260916120000_newsletter_mark_confirmation_sent.sql'),
  'utf8'
);

const beginFn = sql.slice(
  sql.indexOf('create or replace function public.newsletter_begin_signup'),
  sql.indexOf('create or replace function public.newsletter_mark_confirmation_sent')
);

test('concurrent first-time signups are serialized before token mint/upsert', () => {
  const lockAt = beginFn.indexOf("pg_advisory_xact_lock(hashtext(v_email), hashtext('daily'))");
  const selectAt = beginFn.indexOf('from public.newsletter_subscribers');
  const insertAt = beginFn.indexOf('insert into public.newsletter_subscribers');
  assert.ok(lockAt > 0, 'advisory lock must exist');
  assert.ok(lockAt < selectAt, 'lock must be taken before selecting the row');
  assert.ok(selectAt < insertAt, 'row lock must happen before upsert');
});

test('already active subscribers raise before any mutation', () => {
  const activeAt = beginFn.indexOf("if v_status = 'active'");
  const insertAt = beginFn.indexOf('insert into public.newsletter_subscribers');
  const conflictAt = beginFn.indexOf('on conflict (email, newsletter) do update');
  const guardAt = beginFn.indexOf("where newsletter_subscribers.status is distinct from 'active'");
  assert.ok(activeAt > 0);
  assert.ok(activeAt < insertAt, 'already_subscribed must raise before INSERT/UPDATE');
  assert.ok(conflictAt > 0);
  assert.ok(guardAt > conflictAt, 'upsert must refuse to rewrite an active row');
});
