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

  if (SENSITIVE_PATH_PREFIXES.some((prefix) => context.url.pathname.startsWith(prefix))) {
    headers.set('Cache-Control', 'no-store, max-age=0');
    headers.set('Pragma', 'no-cache');
  }

  if (response.status >= 500) {
    console.error('morgentidende_server_response', {
      requestId,
      method: context.request.method,
      pathname: context.url.pathname,
      status: response.status
    });
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
});
