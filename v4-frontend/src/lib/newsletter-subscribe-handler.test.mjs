import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSubscribeRequest } from './newsletter-subscribe-handler.mjs';

const read = async (response) => ({
  status: response.status,
  body: await response.json(),
  contentType: response.headers.get('content-type')
});

const requestFrom = (payload, raw) => {
  if (raw === 'malformed') {
    return new Request('https://morgentidende.dk/api/newsletter/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{'
    });
  }
  return new Request('https://morgentidende.dk/api/newsletter/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
};

const explodingDeps = {
  getEnv() { throw new Error('runtime-init-should-not-run'); },
  getSupabase() { throw new Error('supabase-init-should-not-run'); },
  hasSesEnv() { throw new Error('ses-check-should-not-run'); },
  async runBackend() { throw new Error('backend-should-not-run'); }
};

test('invalid email returns 400 even if backend initialization would fail', async () => {
  const response = await handleSubscribeRequest(
    requestFrom({ email: 'not-an-email', newsletter: 'daily', source: 'e2e' }),
    explodingDeps
  );
  const result = await read(response);
  assert.equal(result.status, 400);
  assert.equal(result.contentType, 'application/json');
  assert.equal(result.body.message, 'Indtast en gyldig e-mailadresse.');
});

test('malformed JSON returns 400 without touching backend init', async () => {
  const response = await handleSubscribeRequest(requestFrom(null, 'malformed'), explodingDeps);
  const result = await read(response);
  assert.equal(result.status, 400);
  assert.equal(result.body.message, 'Ugyldig forespørgsel.');
});

test('valid email without Supabase env returns JSON 503', async () => {
  const response = await handleSubscribeRequest(
    requestFrom({ email: 'reader@example.dk', source: 'e2e' }),
    {
      getEnv: () => ({ awsRegion: 'eu-north-1', awsAccessKeyId: 'id', awsSecretAccessKey: 'secret' }),
      getSupabase: () => null,
      hasSesEnv: () => true,
      runBackend: async () => { throw new Error('should-not-run'); }
    }
  );
  const result = await read(response);
  assert.equal(result.status, 503);
  assert.match(result.body.message, /midlertidigt/);
});

test('valid email without SES env returns JSON 503', async () => {
  const response = await handleSubscribeRequest(
    requestFrom({ email: 'reader@example.dk', source: 'e2e' }),
    {
      getEnv: () => ({ awsRegion: '' }),
      getSupabase: () => ({ rpc: async () => ({}) }),
      hasSesEnv: () => false,
      runBackend: async () => { throw new Error('should-not-run'); }
    }
  );
  const result = await read(response);
  assert.equal(result.status, 503);
  assert.match(result.body.message, /gjort klar/);
});

test('unexpected backend exception returns controlled JSON 500, never empty body', async () => {
  const response = await handleSubscribeRequest(
    requestFrom({ email: 'reader@example.dk', source: 'e2e' }),
    {
      getEnv: () => ({ awsRegion: 'eu-north-1', awsAccessKeyId: 'id', awsSecretAccessKey: 'secret' }),
      getSupabase: () => ({ rpc: async () => ({}) }),
      hasSesEnv: () => true,
      runBackend: async () => { throw new Error('boom-from-backend'); }
    }
  );
  const result = await read(response);
  assert.equal(result.status, 500);
  assert.equal(result.contentType, 'application/json');
  assert.ok(result.body.message);
  assert.notEqual(JSON.stringify(result.body), '');
});
