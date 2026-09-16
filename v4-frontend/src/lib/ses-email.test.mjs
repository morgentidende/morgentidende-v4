import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSesV2Payload } from './ses-email.ts';

test('SES v2 payload contains from, destination and html body', () => {
  const payload = JSON.parse(buildSesV2Payload(
    'Morgentidende <nyhedsbrev@morgentidende.dk>',
    'reader@example.dk',
    'Bekræft dit nyhedsbrev fra Morgentidende',
    '<p>Bekræft</p>'
  ));
  assert.equal(payload.FromEmailAddress, 'Morgentidende <nyhedsbrev@morgentidende.dk>');
  assert.deepEqual(payload.Destination.ToAddresses, ['reader@example.dk']);
  assert.equal(payload.Content.Simple.Body.Html.Data, '<p>Bekræft</p>');
});
