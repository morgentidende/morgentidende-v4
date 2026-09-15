export const allowedPublishKinds = new Set(['news', 'comment', 'debate', 'magazine']);

export function normalizePublishKind(kind, categorySlug) {
  if (kind === undefined || kind === null || !String(kind).trim()) return null;

  const originalKind = String(kind).trim().toLowerCase();
  if (['viden', 'liv'].includes(categorySlug) && ['article', 'evergreen'].includes(originalKind)) {
    return { originalKind, normalizedKind: 'magazine' };
  }

  if (!allowedPublishKinds.has(originalKind)) {
    throw new Error('invalid_article_kind');
  }

  return { originalKind, normalizedKind: originalKind };
}
