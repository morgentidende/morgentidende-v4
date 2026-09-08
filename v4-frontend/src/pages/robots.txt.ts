import type { APIRoute } from 'astro';

const PRODUCTION_HOSTS = new Set(['morgentidende.dk', 'www.morgentidende.dk']);

export const GET: APIRoute = ({ request }) => {
  const url = new URL(request.url);
  const isProductionHost = PRODUCTION_HOSTS.has(url.hostname);

  const body = isProductionHost
    ? [
        'User-agent: *',
        'Allow: /',
        'Disallow: /login',
        '',
        'Sitemap: https://morgentidende.dk/sitemap.xml',
        'Sitemap: https://morgentidende.dk/news-sitemap.xml',
        ''
      ].join('\n')
    : [
        'User-agent: *',
        'Disallow: /',
        '',
        '# Pre-launch/non-canonical host: do not index.',
        ''
      ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300'
    }
  });
};
