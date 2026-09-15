import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePublishKind } from './publish-kind.mjs';

test('keeps canonical kinds unchanged', () => {
  for (const kind of ['news', 'comment', 'debate', 'magazine']) {
    assert.deepEqual(normalizePublishKind(kind, 'udland'), { originalKind: kind, normalizedKind: kind });
  }
});

test('normalizes legacy Viden/Liv aliases to magazine', () => {
  for (const category of ['viden', 'liv']) {
    for (const kind of ['article', 'evergreen']) {
      assert.deepEqual(normalizePublishKind(kind, category), { originalKind: kind, normalizedKind: 'magazine' });
    }
  }
});

test('does not normalize legacy aliases outside Viden/Liv', () => {
  assert.throws(() => normalizePublishKind('article', 'udland'), /invalid_article_kind/);
  assert.throws(() => normalizePublishKind('evergreen', 'indland'), /invalid_article_kind/);
});

test('rejects unknown kinds and permits an omitted kind', () => {
  assert.throws(() => normalizePublishKind('feature', 'viden'), /invalid_article_kind/);
  assert.equal(normalizePublishKind(undefined, 'viden'), null);
  assert.equal(normalizePublishKind('', 'liv'), null);
});
