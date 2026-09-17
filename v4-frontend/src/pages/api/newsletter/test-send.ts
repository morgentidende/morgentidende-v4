import type { APIRoute } from 'astro';
import { env as cloudflareEnv } from 'cloudflare:workers';
import { getNewsletterRuntimeEnv, hasSesEnv } from '../../../lib/runtime-env';
import { getV4SupabaseServer } from '../../../lib/v4-supabase-server';
import { buildDailyNewsletterEmail } from '../../../lib/newsletter-email';
import { sendSesHtmlEmail } from '../../../lib/ses-email';

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

const safeEqual = (a: string, b: string) => {
  const aa = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i];
  return diff === 0;
};

const copenhagenDate = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Copenhagen',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);

const redirectResult = (request: Request, result: string, extra: Record<string, string | number> = {}) => {
  const url = new URL('/nyhedsbrev/test', request.url);
  url.searchParams.set('result', result);
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, String(value));
  return Response.redirect(url.toString(), 303);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = cloudflareEnv as unknown as Record<string, string | undefined>;
  const expectedKey = String(runtime.NEWSLETTER_TEST_KEY || '').trim();
  const contentType = request.headers.get('content-type') || '';
  const isFormPost = contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data');
  let formKey = '';
  if (isFormPost) {
    const form = await request.formData().catch(() => null);
    formKey = String(form?.get('key') || '').trim();
  }
  const suppliedKey = String(request.headers.get('x-newsletter-test-key') || formKey).trim();
  const reply = (status: number, body: Record<string, unknown>) =>
    isFormPost ? redirectResult(request, String(body.error || (body.ok ? 'sent' : 'failed')), body.ok ? { articles: Number(body.articles || 0) } : {}) : json(status, body);

  if (!expectedKey || !suppliedKey || !safeEqual(expectedKey, suppliedKey)) {
    return reply(404, { ok: false, error: 'invalid_key' });
  }

  const env = getNewsletterRuntimeEnv(locals);
  const supabase = getV4SupabaseServer(locals);
  if (!supabase || !hasSesEnv(env)) {
    return reply(503, { ok: false, error: 'runtime_not_ready' });
  }

  const subscriberResult = await supabase.rpc('newsletter_test_recipient');

  if (subscriberResult.error) {
    return reply(500, { ok: false, error: 'subscriber_lookup_failed' });
  }

  const subscribers = subscriberResult.data || [];
  if (subscribers.length !== 1) {
    return reply(409, {
      ok: false,
      error: 'test_send_requires_exactly_one_active_subscriber',
      active_subscribers_seen: subscribers.length
    });
  }

  const now = new Date();
  const articleResult = await supabase.rpc('newsletter_daily_articles', {
    p_now: now.toISOString()
  });
  if (articleResult.error) {
    return reply(500, { ok: false, error: 'article_lookup_failed' });
  }

  const articles = articleResult.data || [];
  if (!articles.length) {
    return reply(409, { ok: false, error: 'no_articles' });
  }

  const subscriber = subscribers[0];
  const unsubscribeUrl = `https://morgentidende.dk/api/newsletter/unsubscribe?token=${encodeURIComponent(String(subscriber.unsubscribe_token))}`;
  const localDate = copenhagenDate(now);
  const html = buildDailyNewsletterEmail(articles, unsubscribeUrl, localDate);

  const mail = await sendSesHtmlEmail({
    region: env.awsRegion,
    accessKeyId: env.awsAccessKeyId,
    secretAccessKey: env.awsSecretAccessKey,
    from: env.newsletterFrom,
    to: String(subscriber.email),
    subject: '[TEST] Morgentidende – dagens vigtigste historier',
    html
  });

  if (!mail.ok) {
    return reply(502, { ok: false, error: 'ses_failed', status: mail.status });
  }

  return reply(200, {
    ok: true,
    articles: articles.length,
    recipient_count: 1,
    subject: '[TEST] Morgentidende – dagens vigtigste historier'
  });
};
