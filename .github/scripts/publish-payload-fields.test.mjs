import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePublishPayloadFields } from './publish-payload-fields.mjs';

const base = {
  queue_id: 'q1',
  slug: 'test-slug',
  headline: 'Rubrik',
  category_slug: 'udland',
  body_markdown: 'Tekst',
  source_metadata: [],
  editorial_metadata: {},
};

test('accepts canonical deck and editorial_metadata.sagen_kort', () => {
  const result = validatePublishPayloadFields({
    ...base,
    deck: 'Manchet her.',
    editorial_metadata: { sagen_kort: ['Fakta et.', 'Fakta to.'] },
  });
  assert.equal(result.deck, 'Manchet her.');
  assert.deepEqual(result.sagen_kort, ['Fakta et.', 'Fakta to.']);
});

test('accepts temporary manchet and top-level sagen_kort aliases', () => {
  const result = validatePublishPayloadFields({
    ...base,
    manchet: 'Manchet her.',
    sagen_kort: ['Fakta et.', 'Fakta to.'],
  });
  assert.equal(result.deck, 'Manchet her.');
  assert.deepEqual(result.sagen_kort, ['Fakta et.', 'Fakta to.']);
});

test('rejects conflicting deck aliases', () => {
  assert.throws(
    () => validatePublishPayloadFields({ ...base, deck: 'A', manchet: 'B' }),
    /deck_alias_conflict/,
  );
});

test('rejects conflicting sagen_kort aliases', () => {
  assert.throws(
    () => validatePublishPayloadFields({
      ...base,
      sagen_kort: ['Et.', 'To.'],
      editorial_metadata: { sagen_kort: ['Et.', 'Andet.'] },
    }),
    /sagen_kort_alias_conflict/,
  );
});

test('rejects text slug in story_cluster_id', () => {
  assert.throws(
    () => validatePublishPayloadFields({ ...base, story_cluster_id: 'ceuta-migrant-crisis-2026' }),
    /invalid_story_cluster_id/,
  );
});

test('accepts UUID story_cluster_id and slug story_cluster_key', () => {
  const result = validatePublishPayloadFields({
    ...base,
    story_cluster_id: 'b972ac0f-fce8-412e-b411-da1c827781c9',
    story_cluster_key: 'ceuta-migrationskrise-2026',
  });
  assert.equal(result.story_cluster_id, 'b972ac0f-fce8-412e-b411-da1c827781c9');
  assert.equal(result.story_cluster_key, 'ceuta-migrationskrise-2026');
});

test('rejects invalid story_cluster_key', () => {
  assert.throws(
    () => validatePublishPayloadFields({ ...base, story_cluster_key: 'NOT A KEY' }),
    /invalid_story_cluster_key/,
  );
});

test('rejects sagen_kort that is not two nonempty strings', () => {
  assert.throws(
    () => validatePublishPayloadFields({ ...base, sagen_kort: ['kun en'] }),
    /sagen_kort_must_have_exactly_two_nonempty_points/,
  );
});
