import test from 'node:test';
import assert from 'node:assert/strict';
import {
  containsSagenKortHeading,
  normalizeBriefPoints,
  stripSagenKortSection
} from './article-content-normalizer.mjs';

test('two structured points are preserved and ordinary body is unchanged', () => {
  assert.deepEqual(normalizeBriefPoints([' Punkt 1 ', 'Punkt 2']), ['Punkt 1', 'Punkt 2']);
  const body = 'Første afsnit.\n\n## Baggrund\nMere tekst.';
  assert.deepEqual(stripSagenKortSection(body), { bodyMarkdown: body, removed: false });
});

test('markdown Sagen kort section is removed while next heading is preserved', () => {
  const body = '## Sagen kort\n\n- Punkt 1\n- Punkt 2\n\n## Baggrund\nResten af artiklen.';
  const result = stripSagenKortSection(body);
  assert.equal(result.removed, true);
  assert.equal(result.bodyMarkdown, '## Baggrund\nResten af artiklen.');
  assert.equal(containsSagenKortHeading(result.bodyMarkdown), false);
});

test('inline HTML Sagen kort heading and list are removed, following paragraph preserved', () => {
  const body = '<h2>Sagen kort</h2><ul><li>Punkt 1</li><li>Punkt 2</li></ul><p>Næste tekst.</p>';
  const result = stripSagenKortSection(body);
  assert.equal(result.removed, true);
  assert.equal(result.bodyMarkdown, '<p>Næste tekst.</p>');
});

test('ordinary sentence containing sagen kort is never removed', () => {
  const body = 'Journalisten opsummerede sagen kort, før mødet fortsatte.';
  assert.deepEqual(stripSagenKortSection(body), { bodyMarkdown: body, removed: false });
});

test('normalizer is idempotent', () => {
  const body = 'SAGEN KORT\n- Punkt 1\n- Punkt 2\n\nBrødteksten begynder her.';
  const once = stripSagenKortSection(body).bodyMarkdown;
  const twice = stripSagenKortSection(once).bodyMarkdown;
  assert.equal(twice, once);
});

test('one or three structured points are invalid rather than truncated or reconstructed', () => {
  assert.deepEqual(normalizeBriefPoints(['kun ét']), []);
  assert.deepEqual(normalizeBriefPoints(['ét', 'to', 'tre']), []);
  assert.deepEqual(normalizeBriefPoints(['ét', ' ', 'to']), ['ét', 'to']);
});

test('historical article with structured field plus body section has only canonical brief data after normalization', () => {
  const article = {
    sagen_kort: ['Første hovedpointe', 'Anden hovedpointe'],
    body_markdown: '## SAGEN KORT\n- Første hovedpointe\n- Anden hovedpointe\n\n## Historien\nBrødtekst.'
  };
  assert.equal(normalizeBriefPoints(article.sagen_kort).length, 2);
  const normalizedBody = stripSagenKortSection(article.body_markdown).bodyMarkdown;
  assert.equal(containsSagenKortHeading(normalizedBody), false);
  assert.match(normalizedBody, /## Historien/);
});

test('case and whitespace variants are normalized', () => {
  const body = '   ###   SaGeN   KoRt   ###   \n\n* Punkt 1\n* Punkt 2\n\nTekst.';
  const result = stripSagenKortSection(body);
  assert.equal(result.removed, true);
  assert.equal(result.bodyMarkdown, 'Tekst.');
});
