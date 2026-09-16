import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePublishPayloadShape } from './publish-payload-shape.mjs';

test('accepts canonical deck and editorial_metadata.sagen_kort', () => {
  const result = validatePublishPayloadShape({
    deck: 'Hvorfor det gælder nu.',
    editorial_metadata: { sagen_kort: ['Første faktum.', 'Andet faktum.'] },
  });
  assert.equal(result.deck, 'Hvorfor det gælder nu.');
  assert.deepEqual(result.sagen_kort, ['Første faktum.', 'Andet faktum.']);
});

test('accepts temporary manchet and top-level sagen_kort aliases', () => {
  const result = validatePublishPayloadShape({
    manchet: 'Hvorfor det gælder nu.',
    sagen_kort: ['Første faktum.', 'Andet faktum.'],
    editorial_metadata: {},
  });
  assert.equal(result.deck, 'Hvorfor det gælder nu.');
  assert.deepEqual(result.sagen_kort, ['Første faktum.', 'Andet faktum.']);
});

test('rejects conflicting deck aliases', () => {
  assert.throws(
    () => validatePublishPayloadShape({ deck: 'A', manchet: 'B' }),
    /deck_alias_conflict/,
  );
});

test('rejects conflicting sagen_kort aliases', () => {
  assert.throws(
    () => validatePublishPayloadShape({
      sagen_kort: ['Et.', 'To.'],
      editorial_metadata: { sagen_kort: ['Andet.', 'To.'] },
    }),
    /sagen_kort_alias_conflict/,
  );
});

test('rejects slug in story_cluster_id', () => {
  assert.throws(
    () => validatePublishPayloadShape({ story_cluster_id: 'ceuta-migrant-crisis-2026' }),
    /invalid_story_cluster_id/,
  );
});

test('accepts story_cluster_key slug shape without resolving it', () => {
  const result = validatePublishPayloadShape({
    story_cluster_key: 'ceuta-migrationskrise-2026',
    editorial_metadata: { sagen_kort: ['Et.', 'To.'] },
  });
  assert.equal(result.story_cluster_key, 'ceuta-migrationskrise-2026');
  assert.equal(result.story_cluster_id, null);
});

test('rejects incomplete sagen_kort', () => {
  assert.throws(
    () => validatePublishPayloadShape({ sagen_kort: ['kun ét'] }),
    /sagen_kort_must_have_exactly_two_nonempty_points/,
  );
});
