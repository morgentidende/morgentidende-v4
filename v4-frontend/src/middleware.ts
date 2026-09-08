import { defineMiddleware } from 'astro:middleware';

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "media-src 'self' https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests"
].join('; ');

const SENSITIVE_PATH_PREFIXES = ['/login', '/auth', '/admin'];

const setEdgeCache = (headers: Headers, edgeSeconds: number, staleSeconds: number) => {
  headers.set('Cache-Control', `public, max-age=0, s-maxage=${edgeSeconds}, stale-while-revalidate=${staleSeconds}`);
  headers.set('Cloudflare-CDN-Cache-Control', `public, max-age=${edgeSeconds}, stale-while-revalidate=${staleSeconds}`);
};

export const onRequest = defineMiddleware(async (context, next) => {
  const requestId = crypto.randomUUID();
  let response: Response;

  try {
    response = await next();
  } catch (error) {
    const details = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { message: String(error) };

    console.error('morgentidende_request_error', {
      requestId,
      method: context.request.method,
      pathname: context.url.pathname,
      ...details
    });
    throw error;
  }

  const headers = new Headers(response.headers);
  const pathname = context.url.pathname;

  headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Origin-Agent-Cluster', '?1');
  headers.set('X-Request-Id', requestId);
  headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()'
  );
  headers.set('Cross-Origin-Resource-Policy', 'same-site');

  if (context.url.hostname.endsWith('.workers.dev')) {
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }

  // One authoritative runtime cache policy for SSR pages.
  // The front page is deliberately freshest so a new Breaking lead cannot sit behind a long edge TTL.
  if (response.status >= 200 && response.status < 400) {
    if (pathname === '/') {
      setEdgeCache(headers, 10, 20);
    } else if (pathname.startsWith('/artikel/')) {
      setEdgeCache(headers, 30, 60);
    } else if (pathname.startsWith('/kategori/')) {
      setEdgeCache(headers, 30, 60);
    }
  }

  if (SENSITIVE_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    headers.set('Cache-Control', 'no-store, max-age=0');
    headers.delete('Cloudflare-CDN-Cache-Control');
    headers.set('Pragma', 'no-cache');
  }

  if (response.status >= 500) {
    console.error('morgentidende_server_response', {
      requestId,
      method: context.request.method,
      pathname,
      status: response.status
    });
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
});
