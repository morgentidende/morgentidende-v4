type Article = Record<string, any>;
type Category = Record<string, any>;

export function buildFrontpageModel(articles: Article[], categories: Category[], nowMs = Date.now()) {
  const categoryById = new Map(categories.map((category) => [category.id, category.name]));
  const now = new Date(nowMs);
  const isActiveBreaking = (article: Article) =>
    Boolean(article?.is_breaking) && (!article.breaking_until || new Date(article.breaking_until) > now);

  const breaking = articles.find((article) => article.is_lead && isActiveBreaking(article));
  const standardLead = articles.find((article) => article.is_lead && !isActiveBreaking(article));
  const lead = breaking || standardLead;
  const leadType = breaking
    ? 'breaking'
    : standardLead && categoryById.get(standardLead.category_id) === 'Tema'
      ? 'theme'
      : standardLead
        ? 'standard'
        : null;

  const others = lead ? articles.filter((article) => article.id !== lead.id) : articles;
  const followups = lead?.story_cluster_id
    ? others.filter((article) => article.story_cluster_id === lead.story_cluster_id).slice(0, 4)
    : lead
      ? others.slice(0, 3)
      : [];

  const leadBoxIds = new Set([lead?.id, ...followups.map((article) => article.id)].filter(Boolean));
  const newsBarArticle = lead
    ? articles.find(
        (article) =>
          !leadBoxIds.has(article.id) &&
          !['Viden', 'Liv', 'Kommentar'].includes(categoryById.get(article.category_id) as string)
      )
    : null;

  const usedIds = new Set([...leadBoxIds, newsBarArticle?.id].filter(Boolean));
  const stream = articles.filter((article) => !usedIds.has(article.id));
  const newsCandidates = stream.filter(
    (article) => !['Viden', 'Liv'].includes(categoryById.get(article.category_id) as string)
  );

  const leadPublishedAt = lead?.published_at ? new Date(lead.published_at).getTime() : Number.NaN;
  const leadAgeMs = Number.isFinite(leadPublishedAt) ? nowMs - leadPublishedAt : Number.POSITIVE_INFINITY;
  const formerLeadGraceActive = Boolean(lead) && leadAgeMs >= 0 && leadAgeMs <= 2 * 60 * 60 * 1000;
  const formerLead = lead
    ? newsCandidates.find((article) => {
        const publishedAt = article?.published_at ? new Date(article.published_at).getTime() : Number.NaN;
        return (
          Number.isFinite(publishedAt) &&
          publishedAt < leadPublishedAt &&
          article.story_cluster_id !== lead.story_cluster_id
        );
      })
    : null;

  let orderedNews = [...newsCandidates];
  if (formerLeadGraceActive && formerLead) {
    orderedNews = orderedNews.filter((article) => article.id !== formerLead.id);
    orderedNews.splice(Math.min(3, orderedNews.length), 0, formerLead);
  }

  return {
    categoryById,
    lead,
    leadType,
    followups,
    newsBarArticle,
    news: orderedNews.slice(0, 15),
    formerLead,
    formerLeadGraceActive,
    leadCategory: lead ? categoryById.get(lead.category_id) : null
  };
}
