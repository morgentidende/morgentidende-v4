const recommendationStopwords = new Set([
  'eller', 'ikke', 'som', 'med', 'til', 'fra', 'for', 'der', 'den', 'det', 'de', 'en', 'et', 'har', 'kan', 'vil',
  'skal', 'var', 'over', 'under', 'efter', 'før', 'sine', 'sin', 'sit', 'sig', 'mod', 'mere', 'nye', 'ny', 'om'
]);

export function buildBriefPoints(article: any) {
  const storedBriefPoints = Array.isArray(article?.sagen_kort)
    ? article.sagen_kort.map((point: unknown) => String(point || '').trim()).filter(Boolean).slice(0, 2)
    : [];

  const plainBody = (article?.body_markdown || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const summaryCandidates = [article?.deck || '', ...plainBody.split(/(?<=[.!?])\s+/)]
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 45 && sentence.length <= 190);

  const fallbackBriefPoints: string[] = [];
  for (const sentence of summaryCandidates) {
    const normalized = sentence.toLocaleLowerCase('da-DK').replace(/[^a-zæøå0-9]+/g, ' ').trim();
    if (!normalized || fallbackBriefPoints.some((point) => point.toLocaleLowerCase('da-DK').replace(/[^a-zæøå0-9]+/g, ' ').trim() === normalized)) continue;
    fallbackBriefPoints.push(sentence);
    if (fallbackBriefPoints.length === 2) break;
  }

  return storedBriefPoints.length === 2 ? storedBriefPoints : fallbackBriefPoints;
}

const recommendationTerms = (value = '') => new Set(
  value
    .toLocaleLowerCase('da-DK')
    .replace(/[^a-zæøå0-9]+/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length >= 4 && !recommendationStopwords.has(term))
);

export function buildArticleRecommendations(article: any, recommendations: any[], storyRelated: any[]) {
  const storyRelatedIds = new Set(storyRelated.map((item) => item.id));
  const articleTerms = recommendationTerms(`${article?.headline || ''} ${article?.deck || ''}`);
  const candidateRelevanceScore = (candidate: any) => {
    const candidateTerms = recommendationTerms(`${candidate.headline || ''} ${candidate.deck || ''}`);
    let overlap = 0;
    for (const term of candidateTerms) if (articleTerms.has(term)) overlap += 1;
    const sameCategory = candidate.category_id === article?.category_id ? 6 : 0;
    return sameCategory + Math.min(overlap, 5) * 2;
  };

  const recommendationPool = recommendations.filter((candidate) => !storyRelatedIds.has(candidate.id));
  const relevantThree = [...recommendationPool]
    .sort((a, b) => {
      const scoreDifference = candidateRelevanceScore(b) - candidateRelevanceScore(a);
      if (scoreDifference !== 0) return scoreDifference;
      return new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime();
    })
    .slice(0, 3);
  const usedRecommendationIds = new Set([...relevantThree, ...storyRelated].map((item) => item.id));
  const currentThree = recommendations
    .filter((candidate) => !usedRecommendationIds.has(candidate.id))
    .slice(0, 3);

  return { relevantThree, currentThree };
}
