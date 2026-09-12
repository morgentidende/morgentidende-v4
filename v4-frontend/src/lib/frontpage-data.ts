import { v4Supabase } from './v4-supabase';

const articleSelect = 'id,slug,category_id,story_cluster_id,headline,frontpage_headline,headline_accent_text,deck,hero_url,hero_alt,is_lead,is_breaking,breaking_until,published_at';

export async function loadFrontpageData() {
  let articles: any[] = [];
  let categories: any[] = [];
  let viden: any[] = [];
  let liv: any[] = [];
  let loadError = false;

  if (v4Supabase) {
    const [articlesResult, categoriesResult] = await Promise.all([
      v4Supabase.from('v4_public_articles').select(articleSelect).order('published_at', { ascending: false }).limit(64),
      v4Supabase.from('v4_public_categories').select('id,name,sort_order').order('sort_order', { ascending: true })
    ]);

    loadError = Boolean(articlesResult.error || categoriesResult.error);

    if (!loadError) {
      articles = articlesResult.data || [];
      categories = categoriesResult.data || [];

      const videnCategoryId = categories.find((category) => category.name === 'Viden')?.id;
      const livCategoryId = categories.find((category) => category.name === 'Liv')?.id;

      if (videnCategoryId) {
        const result = await v4Supabase
          .from('v4_public_articles')
          .select(articleSelect)
          .eq('category_id', videnCategoryId)
          .order('published_at', { ascending: false })
          .limit(4);

        loadError = Boolean(result.error);
        if (!result.error) viden = result.data || [];
      }

      if (!loadError && livCategoryId) {
        const result = await v4Supabase
          .from('v4_public_articles')
          .select(articleSelect)
          .eq('category_id', livCategoryId)
          .order('published_at', { ascending: false })
          .limit(4);

        loadError = Boolean(result.error);
        if (!result.error) liv = result.data || [];
      }
    }
  } else {
    loadError = true;
  }

  return { articles, categories, viden, liv, loadError };
}
