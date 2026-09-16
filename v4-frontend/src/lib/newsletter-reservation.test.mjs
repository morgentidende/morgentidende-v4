import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBeginSignup,
  applyMarkSent,
  applyRelease,
  resetReservationSeq,
  RESERVATION_TTL_MS
} from './newsletter-reservation.mjs';

test('two concurrent first signups: only the first reserves a token', () => {
  resetReservationSeq();
  const first = applyBeginSignup(null, 1_000);
  assert.equal(first.decision.action, 'mint_and_reserve');
  const second = applyBeginSignup(first.row, 1_100);
  assert.equal(second.decision.action, 'signup_in_flight');
  assert.equal(second.row.reservationId, first.row.reservationId);
});

test('SES failure after reservation allows retry', () => {
  resetReservationSeq();
  const reserved = applyBeginSignup(null, 1_000);
  const released = applyRelease(reserved.row, reserved.row.reservationId);
  assert.equal(released.ok, true);
  const retry = applyBeginSignup(released.row, 1_500);
  assert.equal(retry.decision.action, 'mint_and_reserve');
  assert.notEqual(retry.row.reservationId, reserved.row.reservationId);
});

test('stale reservation after Worker crash allows later retry', () => {
  resetReservationSeq();
  const reserved = applyBeginSignup(null, 1_000);
  const later = applyBeginSignup(reserved.row, 1_000 + RESERVATION_TTL_MS + 1);
  assert.equal(later.decision.action, 'mint_and_reserve');
  assert.notEqual(later.row.reservationId, reserved.row.reservationId);
});

test('stale A success cannot mark B sent', () => {
  resetReservationSeq();
  const a = applyBeginSignup(null, 1_000);
  const b = applyBeginSignup(a.row, 1_000 + RESERVATION_TTL_MS + 1);
  const staleMark = applyMarkSent(b.row, a.row.reservationId, 50_000);
  assert.equal(staleMark.ok, false);
  assert.equal(staleMark.row.reservationId, b.row.reservationId);
  assert.equal(staleMark.row.sendState, 'reserved');
});

test('stale A failure cannot release B', () => {
  resetReservationSeq();
  const a = applyBeginSignup(null, 1_000);
  const b = applyBeginSignup(a.row, 1_000 + RESERVATION_TTL_MS + 1);
  const staleRelease = applyRelease(b.row, a.row.reservationId);
  assert.equal(staleRelease.ok, false);
  assert.equal(staleRelease.row.reservationId, b.row.reservationId);
  assert.equal(staleRelease.row.sendState, 'reserved');
});

test('B can complete its own reservation after A is stale', () => {
  resetReservationSeq();
  const a = applyBeginSignup(null, 1_000);
  const b = applyBeginSignup(a.row, 1_000 + RESERVATION_TTL_MS + 1);
  const marked = applyMarkSent(b.row, b.row.reservationId, 50_000);
  assert.equal(marked.ok, true);
  assert.equal(marked.row.sendState, 'sent');
  assert.equal(marked.row.reservationId, null);
});
