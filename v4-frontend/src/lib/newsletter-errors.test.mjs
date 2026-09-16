import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyNewsletterRpcError, newsletterRpcResponse } from './newsletter-errors.mjs';

test('maps already subscribed to a neutral 200', () => {
  const code = classifyNewsletterRpcError({ message: 'already_subscribed' });
  const response = newsletterRpcResponse(code);
  assert.equal(code, 'already_subscribed');
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
});

test('maps invalid email to 400', () => {
  const response = newsletterRpcResponse(classifyNewsletterRpcError({ message: 'invalid_email' }));
  assert.equal(response.status, 400);
});

test('maps confirmation rate limit to 429', () => {
  const response = newsletterRpcResponse(classifyNewsletterRpcError({ message: 'signup_rate_limited' }));
  assert.equal(response.status, 429);
});

test('maps in-flight reservation to 429', () => {
  const response = newsletterRpcResponse(classifyNewsletterRpcError({ message: 'signup_in_flight' }));
  assert.equal(response.status, 429);
});

test('maps unexpected database errors to 500', () => {
  const response = newsletterRpcResponse(classifyNewsletterRpcError({ message: 'deadlock detected' }));
  assert.equal(response.status, 500);
});
