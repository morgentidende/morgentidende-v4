import { defineMiddleware } from 'astro:middleware';

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "frame-src https://www.youtube-nocookie.com",
  "form-action 'self'",
  "script-src 'self' https://www.googletagmanager.com",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://*.google-analytics.com",
  "media-src 'self' https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests"
].join('; ');

const SENSITIVE_PATH_PREFIXES = ['/login', '/auth', '/admin'];
const CANONICAL_HOST = 'morgentidende.dk';
const REDIRECT_HOSTS = new Set([
  'www.morgentidende.dk',
  'morgentidende-v4.morgentidende.workers.dev'
]);

export const onRequest = defineMiddleware(async (context, next) => {
  if (REDIRECT_HOSTS.has(context.url.hostname)) {
    const target = new URL(context.url.pathname + context.url.search, `https://${CANONICAL_HOST}`);
    return Response.redirect(target, 301);
  }

  const response = await next();
  const headers = new Headers(response.headers);

  headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Origin-Agent-Cluster', '?1');
  headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()'
  );
  headers.set('Cross-Origin-Resource-Policy', 'same-site');

  if (SENSITIVE_PATH_PREFIXES.some((prefix) => context.url.pathname.startsWith(prefix))) {
    headers.set('Cache-Control', 'no-store, max-age=0');
    headers.set('Pragma', 'no-cache');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
});
