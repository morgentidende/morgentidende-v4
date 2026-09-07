import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const origin = (site || new URL('https://morgentidende.dk')).origin;
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /login',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    `Sitemap: ${origin}/news-sitemap.xml`,
    ''
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
