import { v4Supabase } from './v4-supabase';

const categoryFields = 'id,slug,name,description';
const categoryArticleFields = 'id,slug,headline,frontpage_headline,headline_accent_text,deck,hero_url,hero_alt,published_at';

export async function loadCategoryPageData(categorySlug?: string) {
  let category: any = null;
  let articles: any[] = [];
  let backendUnavailable = false;

  if (!v4Supabase) {
    backendUnavailable = true;
  } else if (categorySlug) {
    const categoryResult = await v4Supabase
      .from('v4_public_categories')
      .select(categoryFields)
      .eq('slug', categorySlug)
      .maybeSingle();

    if (categoryResult.error) {
      backendUnavailable = true;
    } else {
      category = categoryResult.data;
    }

    if (category) {
      const articlesResult = await v4Supabase
        .from('v4_public_articles')
        .select(categoryArticleFields)
        .eq('category_id', category.id)
        .order('published_at', { ascending: false })
        .limit(40);

      if (articlesResult.error) backendUnavailable = true;
      else articles = articlesResult.data || [];
    }
  }

  return { category, articles, backendUnavailable };
}
