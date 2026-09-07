import type { APIRoute } from 'astro';
import { v4Supabase } from '../lib/v4-supabase';

const escapeXml = (value: string) => value.replace(/[<>&'\"]/g, (char) => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','\"':'&quot;'}[char] || char));

export const GET: APIRoute = async ({ site }) => {
  const origin = (site || new URL('https://morgentidende.dk')).origin;
  let articles: any[] = [];
  if (v4Supabase) {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const result = await v4Supabase
      .from('v4_public_articles')
      .select('slug,headline,published_at')
      .gte('published_at', cutoff)
      .order('published_at', { ascending: false })
      .limit(1000);
    articles = result.data || [];
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${articles.map((a) => `  <url>\n    <loc>${escapeXml(`${origin}/artikel/${a.slug}`)}</loc>\n    <news:news>\n      <news:publication><news:name>Morgentidende</news:name><news:language>da</news:language></news:publication>\n      <news:publication_date>${new Date(a.published_at).toISOString()}</news:publication_date>\n      <news:title>${escapeXml(a.headline)}</news:title>\n    </news:news>\n  </url>`).join('\n')}\n</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
};
