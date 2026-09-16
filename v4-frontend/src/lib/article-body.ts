import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { stripSagenKortSection } from './article-content-normalizer.mjs';

const escapeHtml = (value = '') => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const ensureBodyImageAlt = (html: string, fallbackAlt: string) => html.replace(/<img\b([^>]*)>/gi, (tag, attributes) => {
  const escapedFallback = escapeHtml(fallbackAlt || 'Illustration til artiklen');
  if (/\balt\s*=\s*(["'])\s*\1/i.test(attributes)) {
    return `<img${attributes.replace(/\balt\s*=\s*(["'])\s*\1/i, `alt="${escapedFallback}"`)}>`;
  }
  if (/\balt\s*=/i.test(attributes)) return tag;
  return `<img${attributes} alt="${escapedFallback}">`;
});

const inlineRelatedMarkup = (item: any) => `
  <aside class="v4-inline-related" aria-label="Læs også">
    <span class="v4-inline-related__label">Læs også</span>
    <a href="/artikel/${encodeURIComponent(item.slug)}">${escapeHtml(item.headline || '')}</a>
  </aside>`;

const injectAfterParagraph = (html: string, paragraphNumber: number, insertion: string) => {
  let seen = 0;
  return html.replace(/<\/p>/g, (match) => {
    seen += 1;
    return seen === paragraphNumber ? `${match}${insertion}` : match;
  });
};

export async function buildArticleBody(article: any, storyRelated: any[]) {
  const normalizedBody = stripSagenKortSection(article?.body_markdown || '');
  if (normalizedBody.removed) {
    console.warn('duplicate_sagen_kort_removed', {
      article_id: article?.id || null,
      event: 'duplicate_sagen_kort_removed',
      source_stage: 'render_guard'
    });
  }

  const rawBodyHtml = article
    ? sanitizeHtml(await marked.parse(normalizedBody.bodyMarkdown), {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'figure', 'figcaption']),
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          img: ['src', 'alt', 'title', 'loading'],
          a: ['href', 'title', 'target', 'rel']
        }
      })
    : '';

  const bodyWithImageAlt = ensureBodyImageAlt(rawBodyHtml, article?.headline || 'Illustration til artiklen');
  const inlineRelatedCandidates = storyRelated.slice(0, 2);
  const paragraphCount = (bodyWithImageAlt.match(/<\/p>/g) || []).length;
  const inlineRelated = paragraphCount >= 4 ? inlineRelatedCandidates : [];
  const remainingStoryRelated = storyRelated.slice(inlineRelated.length);

  let bodyHtml = bodyWithImageAlt;
  if (inlineRelated[0]) bodyHtml = injectAfterParagraph(bodyHtml, 3, inlineRelatedMarkup(inlineRelated[0]));
  if (inlineRelated[1] && paragraphCount >= 8) bodyHtml = injectAfterParagraph(bodyHtml, 7, inlineRelatedMarkup(inlineRelated[1]));

  return { bodyHtml, remainingStoryRelated };
}
