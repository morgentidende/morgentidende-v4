import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBeginSignup,
  applySesFailure,
  applySesSuccess,
  RESERVATION_TTL_MS
} from './newsletter-reservation.mjs';

test('two concurrent first signups: only the first reserves a token', () => {
  const first = applyBeginSignup(null, 1_000);
  assert.equal(first.decision.action, 'mint_and_reserve');
  assert.equal(first.row.sendState, 'reserved');
  assert.equal(first.row.tokenGeneration, 1);

  const second = applyBeginSignup(first.row, 1_100);
  assert.equal(second.decision.action, 'signup_in_flight');
  assert.equal(second.row.tokenGeneration, 1);
});

test('SES failure after reservation allows retry', () => {
  const reserved = applyBeginSignup(null, 1_000).row;
  const released = applySesFailure(reserved);
  assert.equal(released.sendState, 'idle');
  const retry = applyBeginSignup(released, 1_500);
  assert.equal(retry.decision.action, 'mint_and_reserve');
  assert.equal(retry.row.tokenGeneration, 2);
});

test('stale reservation after Worker crash allows later retry', () => {
  const reserved = applyBeginSignup(null, 1_000).row;
  const later = applyBeginSignup(reserved, 1_000 + RESERVATION_TTL_MS + 1);
  assert.equal(later.decision.action, 'mint_and_reserve');
  assert.equal(later.row.tokenGeneration, 2);
});

test('successful send still rate-limits for two minutes', () => {
  const reserved = applyBeginSignup(null, 1_000).row;
  const sent = applySesSuccess(reserved, 2_000);
  const retry = applyBeginSignup(sent, 2_000 + 30_000);
  assert.equal(retry.decision.action, 'signup_rate_limited');
});
