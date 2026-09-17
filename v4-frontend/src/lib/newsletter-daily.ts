import { createClient } from '@supabase/supabase-js';
import { buildDailyNewsletterEmail } from './newsletter-email';
import { sendSesHtmlEmail } from './ses-email';

type RuntimeEnv = Record<string, string | undefined>;
type DailyArticle = { id: string; slug: string; headline: string; deck: string | null; published_at: string; category_slug?: string | null };
type Delivery = {
  delivery_id: string;
  email: string;
  unsubscribe_token: string;
  email_theme?: 'auto' | 'light' | 'dark' | null;
  include_viden?: boolean | null;
  include_liv?: boolean | null;
};

const copenhagenClock = (date: Date) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return { localDate: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
};

const chunks = <T>(items: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export const runDailyNewsletter = async (env: RuntimeEnv, scheduledAt = new Date()) => {
  const { localDate, hour } = copenhagenClock(scheduledAt);
  if (hour !== 6) return { skipped: 'outside_06_copenhagen', localDate };

  const supabaseUrl = env.PUBLIC_SUPABASE_URL || '';
  const supabaseKey = env.SUPABASE_SECRET_KEY || '';
  const region = env.AWS_SES_REGION || env.AWS_REGION || '';
  const accessKeyId = env.AWS_ACCESS_KEY_ID || '';
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY || '';
  const from = env.NEWSLETTER_FROM || 'Morgentidende <nyhedsbrev@morgentidende.dk>';
  if (!supabaseUrl || !supabaseKey || !region || !accessKeyId || !secretAccessKey) throw new Error('newsletter_runtime_env_missing');

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const articleResult = await supabase.rpc('newsletter_daily_articles', { p_now: scheduledAt.toISOString() });
  if (articleResult.error) throw articleResult.error;
  const articles = (articleResult.data || []) as DailyArticle[];
  if (!articles.length) {
    console.info(JSON.stringify({ event: 'newsletter_daily', result: 'no_articles', local_date: localDate }));
    return { skipped: 'no_articles', localDate };
  }

  const begin = await supabase.rpc('newsletter_begin_daily_dispatch', {
    p_local_date: localDate,
    p_article_ids: articles.map((article) => article.id)
  });
  if (begin.error || !begin.data) throw begin.error || new Error('newsletter_dispatch_missing');
  const dispatchId = begin.data as string;

  let processed = 0;
  for (let batchNo = 0; batchNo < 1000; batchNo += 1) {
    const claim = await supabase.rpc('newsletter_claim_daily_deliveries', { p_dispatch_id: dispatchId, p_limit: 50 });
    if (claim.error) throw claim.error;
    const deliveries = (claim.data || []) as Delivery[];
    if (!deliveries.length) break;

    for (const group of chunks(deliveries, 10)) {
      await Promise.all(group.map(async (delivery) => {
        let ok = false;
        let providerStatus: number | null = null;
        let errorCode: string | null = null;
        try {
          const unsubscribeUrl = `https://morgentidende.dk/api/newsletter/unsubscribe?token=${encodeURIComponent(delivery.unsubscribe_token)}`;
          const selectedArticles = articles.filter((article) => {
            if (article.category_slug === 'viden' && delivery.include_viden !== true) return false;
            if (article.category_slug === 'liv' && delivery.include_liv !== true) return false;
            return true;
          }).slice(0, 8);
          const mail = await sendSesHtmlEmail({
            region, accessKeyId, secretAccessKey, from, to: delivery.email,
            subject: 'Morgentidende – dagens vigtigste historier',
            html: buildDailyNewsletterEmail(selectedArticles, unsubscribeUrl, localDate, {
              emailTheme: delivery.email_theme || 'auto',
              includeViden: delivery.include_viden === true,
              includeLiv: delivery.include_liv === true
            })
          });
          ok = mail.ok;
          providerStatus = mail.status;
          if (!ok) errorCode = `ses_${mail.status}`;
        } catch (error) {
          errorCode = error instanceof Error ? error.name : 'send_exception';
        }

        const marked = await supabase.rpc('newsletter_mark_daily_delivery', {
          p_delivery_id: delivery.delivery_id,
          p_ok: ok,
          p_provider_status: providerStatus,
          p_error_code: errorCode
        });
        if (marked.error) throw marked.error;
        processed += 1;
      }));
    }
  }

  const finish = await supabase.rpc('newsletter_finish_daily_dispatch', { p_dispatch_id: dispatchId });
  if (finish.error) throw finish.error;
  console.info(JSON.stringify({ event: 'newsletter_daily', result: 'finished', local_date: localDate, processed, summary: finish.data }));
  return finish.data;
};
