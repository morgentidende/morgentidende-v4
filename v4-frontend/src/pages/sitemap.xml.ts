import type { APIRoute } from 'astro';
import { v4Supabase } from '../lib/v4-supabase';

const escapeXml = (value: string) => value.replace(/[<>&'\"]/g, (char) => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','\"':'&quot;'}[char] || char));

export const GET: APIRoute = async ({ site }) => {
  const origin = (site || new URL('https://morgentidende.dk')).origin;
  const staticPaths = ['/', '/om', '/redaktionelle-principper', '/kontakt'];
  let articles: any[] = [];
  let categories: any[] = [];
  if (v4Supabase) {
    const [articleResult, categoryResult] = await Promise.all([
      v4Supabase.from('v4_public_articles').select('slug,updated_at,published_at').order('published_at', { ascending: false }),
      v4Supabase.from('v4_public_categories').select('slug').order('sort_order', { ascending: true })
    ]);
    articles = articleResult.data || [];
    categories = categoryResult.data || [];
  }
  const urls = [
    ...staticPaths.map((path) => ({ loc: `${origin}${path}`, lastmod: undefined })),
    ...categories.map((c) => ({ loc: `${origin}/kategori/${c.slug}`, lastmod: undefined })),
    ...articles.map((a) => ({ loc: `${origin}/artikel/${a.slug}`, lastmod: a.updated_at || a.published_at }))
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString()}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
};
