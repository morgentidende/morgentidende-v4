import { v4Supabase } from './v4-supabase';

const articleFields = 'id,slug,category_id,story_cluster_id,headline,deck,body_markdown,author_name,hero_url,hero_alt,hero_credit,hero_license,published_at,updated_at,sagen_kort,source_metadata';
const cardFields = 'id,slug,category_id,story_cluster_id,headline,frontpage_headline,headline_accent_text,deck,hero_url,hero_alt,published_at';

export async function loadArticlePageData(slug?: string) {
  let article: any = null;
  let related: any[] = [];
  let clusterRelated: any[] = [];
  let recommendations: any[] = [];
  let categories: any[] = [];
  let backendError = false;

  if (slug) {
    if (v4Supabase) {
      const [articleResult, categoriesResult] = await Promise.all([
        v4Supabase
          .from('v4_public_articles')
          .select(articleFields)
          .eq('slug', slug)
          .maybeSingle(),
        v4Supabase
          .from('v4_public_categories')
          .select('id,name,sort_order')
          .order('sort_order', { ascending: true })
      ]);

      backendError = Boolean(articleResult.error);
      if (!backendError) article = articleResult.data;
      if (!categoriesResult.error) categories = categoriesResult.data || [];

      if (article) {
        const relationQuery = v4Supabase
          .from('v4_public_relations')
          .select('related_article_id,sort_order')
          .eq('article_id', article.id)
          .order('sort_order', { ascending: true });

        const clusterQuery = article.story_cluster_id
          ? v4Supabase
              .from('v4_public_articles')
              .select(cardFields)
              .eq('story_cluster_id', article.story_cluster_id)
              .neq('id', article.id)
              .order('published_at', { ascending: true })
          : Promise.resolve({ data: [], error: null });

        const recommendationsQuery = v4Supabase
          .from('v4_public_articles')
          .select(cardFields)
          .neq('id', article.id)
          .order('published_at', { ascending: false })
          .limit(28);

        const [relationResult, clusterResult, recResult] = await Promise.all([
          relationQuery,
          clusterQuery,
          recommendationsQuery
        ]);

        clusterRelated = clusterResult.data || [];
        recommendations = recResult.data || [];

        const relatedIds = Array.from(new Set((relationResult.data || []).map((relation: any) => relation.related_article_id)));
        if (relatedIds.length && !clusterRelated.length) {
          const relatedResult = await v4Supabase
            .from('v4_public_articles')
            .select(cardFields)
            .in('id', relatedIds);
          const byId = new Map((relatedResult.data || []).map((item) => [item.id, item]));
          related = relatedIds.map((id) => byId.get(id)).filter(Boolean);
        }
      }
    } else {
      backendError = true;
    }
  }

  return { article, related, clusterRelated, recommendations, categories, backendError };
}
