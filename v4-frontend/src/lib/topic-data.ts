import { v4Supabase } from './v4-supabase';

const topicArticleFields = 'id,slug,category_id,story_cluster_id,headline,frontpage_headline,headline_accent_text,deck,hero_url,hero_alt,published_at';

export async function loadTopicPageData(topic: string) {
  let results: any[] = [];
  let categories: any[] = [];
  let backendError = false;

  if (topic) {
    if (v4Supabase) {
      const [articlesResult, categoriesResult] = await Promise.all([
        v4Supabase
          .from('v4_public_articles')
          .select(topicArticleFields)
          .contains('topics', [topic])
          .order('published_at', { ascending: false })
          .limit(60),
        v4Supabase
          .from('v4_public_categories')
          .select('id,name')
      ]);

      backendError = Boolean(articlesResult.error || categoriesResult.error);
      if (!backendError) {
        results = articlesResult.data || [];
        categories = categoriesResult.data || [];
      }
    } else {
      backendError = true;
    }
  }

  return { results, categories, backendError };
}
