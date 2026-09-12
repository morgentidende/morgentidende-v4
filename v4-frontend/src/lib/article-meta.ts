const imageSourceHosts = new Set([
  'commons.wikimedia.org',
  'upload.wikimedia.org',
  'unsplash.com',
  'images.unsplash.com',
  'pexels.com',
  'pixabay.com',
  'openverse.org'
]);

export function buildSourceItems(article: any) {
  return Array.isArray(article?.source_metadata)
    ? article.source_metadata
        .map((source: any) => {
          const url = typeof source === 'string' ? source : source?.url;
          if (!url || typeof url !== 'string') return null;
          try {
            const parsed = new URL(url);
            if (!['http:', 'https:'].includes(parsed.protocol) || imageSourceHosts.has(parsed.hostname.toLowerCase())) return null;
            const label = (typeof source === 'object' && (source.title || source.name))
              ? String(source.title || source.name)
              : parsed.hostname.replace(/^www\./, '');
            return { url: parsed.toString(), label };
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .filter((source: any, index: number, all: any[]) => all.findIndex((candidate) => candidate.url === source.url) === index)
    : [];
}

export const formatArticleDateTime = (value: Date) => new Intl.DateTimeFormat('da-DK', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Copenhagen'
}).format(value);

const makeSeoTitle = (headline = '', maxLength = 62) => {
  const clean = headline.trim();
  if (clean.length <= maxLength) return clean;
  const candidate = clean.slice(0, maxLength - 1).replace(/\s+\S*$/, '').replace(/[,:;\-–—]+\s*$/, '').trim();
  return `${candidate || clean.slice(0, maxLength - 1).trim()}…`;
};

export function buildArticleMeta(article: any, backendError: boolean, category: string, siteBase: URL) {
  const canonical = article ? new URL(`/artikel/${article.slug}`, siteBase).toString() : undefined;
  const facebookShareUrl = canonical ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonical)}` : '#';
  const publishedDate = article?.published_at ? new Date(article.published_at) : null;
  const updatedDate = article?.updated_at ? new Date(article.updated_at) : publishedDate;
  const articleTitle = article
    ? makeSeoTitle(article.headline)
    : backendError
      ? 'Midlertidigt utilgængelig – Morgentidende'
      : 'Ikke fundet – Morgentidende';
  const displayAuthorName = 'Redaktionen';
  const headlineIsLong = (article?.headline?.length || 0) > 72;
  const headlineIsVeryLong = (article?.headline?.length || 0) > 105;
  const logoUrl = new URL('/morgentidende-sun.png', siteBase).toString();
  const organizationLogo = { '@type': 'ImageObject', url: logoUrl };
  const newsArticleLd = article ? {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.headline,
    description: article.deck || undefined,
    datePublished: article.published_at,
    dateModified: article.updated_at || article.published_at,
    mainEntityOfPage: canonical,
    image: article.hero_url ? [article.hero_url] : undefined,
    articleSection: category || undefined,
    author: {
      '@type': 'Organization',
      name: 'Redaktionen',
      url: new URL('/om-morgentidende', siteBase).toString(),
      logo: organizationLogo,
      parentOrganization: {
        '@type': 'NewsMediaOrganization',
        name: 'Morgentidende',
        url: new URL('/', siteBase).toString(),
        logo: organizationLogo
      }
    },
    publisher: {
      '@type': 'NewsMediaOrganization',
      name: 'Morgentidende',
      url: new URL('/', siteBase).toString(),
      email: 'redaktion@morgentidende.dk',
      publishingPrinciples: new URL('/redaktionelle-principper', siteBase).toString(),
      logo: organizationLogo
    }
  } : undefined;

  return {
    canonical,
    facebookShareUrl,
    publishedDate,
    updatedDate,
    articleTitle,
    displayAuthorName,
    headlineIsLong,
    headlineIsVeryLong,
    newsArticleLd
  };
}
