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

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = cloudflareEnv as unknown as Record<string, string | undefined>;
  const expectedKey = String(runtime.NEWSLETTER_TEST_KEY || '').trim();
  const suppliedKey = String(request.headers.get('x-newsletter-test-key') || '').trim();

  // Keep the temporary tool dark unless a dedicated secret is configured.
  if (!expectedKey || !suppliedKey || !safeEqual(expectedKey, suppliedKey)) {
    return json(404, { ok: false });
  }

  const env = getNewsletterRuntimeEnv(locals);
  const supabase = getV4SupabaseServer(locals);
  if (!supabase || !hasSesEnv(env)) {
    return json(503, { ok: false, error: 'runtime_not_ready' });
  }

  // Safety guard: this development endpoint is allowed to exist only while
  // exactly one active daily subscriber exists. It can therefore never become
  // an accidental broadcast endpoint as the list grows.
  const subscriberResult = await supabase
    .from('newsletter_subscribers')
    .select('email, unsubscribe_token')
    .eq('newsletter', 'daily')
    .eq('status', 'active')
    .is('unsubscribed_at', null)
    .limit(2);

  if (subscriberResult.error) {
    return json(500, { ok: false, error: 'subscriber_lookup_failed' });
  }

  const subscribers = subscriberResult.data || [];
  if (subscribers.length !== 1) {
    return json(409, {
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
    return json(500, { ok: false, error: 'article_lookup_failed' });
  }

  const articles = articleResult.data || [];
  if (!articles.length) {
    return json(409, { ok: false, error: 'no_articles' });
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
    return json(502, { ok: false, error: 'ses_failed', status: mail.status });
  }

  return json(200, {
    ok: true,
    articles: articles.length,
    recipient_count: 1,
    subject: '[TEST] Morgentidende – dagens vigtigste historier'
  });
};
