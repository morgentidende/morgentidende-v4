import { v4Supabase } from './v4-supabase';

const articleSelect = 'id,slug,category_id,story_cluster_id,headline,frontpage_headline,headline_accent_text,deck,hero_url,hero_alt,is_lead,is_breaking,breaking_until,published_at';

export async function loadFrontpageData() {
  let articles: any[] = [];
  let categories: any[] = [];
  let viden: any[] = [];
  let liv: any[] = [];
  let liveCenter: any | null = null;
  let liveUpdates: any[] = [];
  let loadError = false;

  if (v4Supabase) {
    const [articlesResult, categoriesResult, liveCenterResult] = await Promise.all([
      v4Supabase.from('v4_public_articles').select(articleSelect).order('published_at', { ascending: false }).limit(64),
      v4Supabase.from('v4_public_categories').select('id,name,sort_order').order('sort_order', { ascending: true }),
      v4Supabase.from('v4_public_live_centers').select('*').order('starts_at', { ascending: false }).limit(1).maybeSingle()
    ]);

    loadError = Boolean(articlesResult.error || categoriesResult.error || liveCenterResult.error);

    if (!loadError) {
      articles = articlesResult.data || [];
      categories = categoriesResult.data || [];
      liveCenter = liveCenterResult.data || null;

      if (liveCenter?.id) {
        const updatesResult = await v4Supabase
          .from('v4_public_live_updates')
          .select('id,live_center_id,published_at,headline,body')
          .eq('live_center_id', liveCenter.id)
          .order('published_at', { ascending: false })
          .limit(8);

        loadError = Boolean(updatesResult.error);
        if (!updatesResult.error) liveUpdates = updatesResult.data || [];
      }

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

  return { articles, categories, viden, liv, liveCenter, liveUpdates, loadError };
}
