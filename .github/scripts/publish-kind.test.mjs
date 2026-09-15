import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePublishKind } from './publish-kind.mjs';

test('keeps canonical kinds unchanged outside magazine categories', () => {
  for (const kind of ['news', 'comment', 'debate', 'magazine']) {
    assert.deepEqual(normalizePublishKind(kind, 'udland'), { originalKind: kind, normalizedKind: kind });
  }
});

test('normalizes missing and legacy Viden/Liv kinds to magazine', () => {
  for (const category of ['viden', 'liv']) {
    for (const kind of [undefined, null, '', 'article', 'evergreen', 'magazine']) {
      const result = normalizePublishKind(kind, category);
      assert.equal(result.normalizedKind, 'magazine');
    }
  }
});

test('rejects conflicting explicit kinds in Viden/Liv', () => {
  for (const category of ['viden', 'liv']) {
    for (const kind of ['news', 'comment', 'debate', 'feature']) {
      assert.throws(() => normalizePublishKind(kind, category), /kind_category_conflict/);
    }
  }
});

test('defaults omitted kind to news outside Viden/Liv', () => {
  assert.deepEqual(normalizePublishKind(undefined, 'udland'), { originalKind: null, normalizedKind: 'news' });
  assert.deepEqual(normalizePublishKind('', 'indland'), { originalKind: null, normalizedKind: 'news' });
});

test('rejects legacy aliases outside Viden/Liv', () => {
  assert.throws(() => normalizePublishKind('article', 'udland'), /invalid_article_kind/);
  assert.throws(() => normalizePublishKind('evergreen', 'indland'), /invalid_article_kind/);
});
