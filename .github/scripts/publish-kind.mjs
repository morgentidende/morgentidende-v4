export const allowedPublishKinds = new Set(['news', 'comment', 'debate', 'magazine']);

export function normalizePublishKind(kind, categorySlug) {
  const category = String(categorySlug ?? '').trim().toLowerCase();
  const raw = String(kind ?? '').trim().toLowerCase();
  const isMagazineCategory = ['viden', 'liv'].includes(category);

  if (isMagazineCategory) {
    if (!raw || ['magazine', 'article', 'evergreen'].includes(raw)) {
      return { originalKind: raw || null, normalizedKind: 'magazine' };
    }
    throw new Error('kind_category_conflict');
  }

  if (!raw) return { originalKind: null, normalizedKind: 'news' };
  if (!allowedPublishKinds.has(raw)) throw new Error('invalid_article_kind');
  return { originalKind: raw, normalizedKind: raw };
}
