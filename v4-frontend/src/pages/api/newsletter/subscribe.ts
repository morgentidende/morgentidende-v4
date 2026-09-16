import type { APIRoute } from 'astro';
import { getV4SupabaseServer } from '../../../lib/v4-supabase-server';
import { buildNewsletterConfirmationEmail } from '../../../lib/newsletter-email';
import { getNewsletterRuntimeEnv, hasSesEnv } from '../../../lib/runtime-env';
import { sendSesHtmlEmail } from '../../../lib/ses-email';
import {
  NEUTRAL_SIGNUP_MESSAGE,
  classifyNewsletterRpcError,
  newsletterRpcResponse
} from '../../../lib/newsletter-errors.mjs';

const CONSENT_VERSION = 'daily-v2-2026-09-12';
const CONSENT_TEXT = 'Jeg vil modtage Morgentidendes daglige nyhedsbrev. Nyhedsbrevet kan indeholde annoncer og kommercielle links, herunder affiliate-links til produkter og tjenester fra tredjeparter. Jeg kan til enhver tid afmelde mig.';

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

const logNewsletter = (event: string, fields: Record<string, unknown>) => {
  console.info(JSON.stringify({ event, ...fields }));
};

export const POST: APIRoute = async ({ request, site, locals }) => {
  const env = getNewsletterRuntimeEnv(locals);
  const supabase = getV4SupabaseServer(locals);

  if (!supabase) {
    logNewsletter('newsletter_signup', { result: 'missing_supabase_env' });
    return json(503, { message: 'Nyhedsbrevet er midlertidigt utilgængeligt.' });
  }

  if (!hasSesEnv(env)) {
    logNewsletter('newsletter_signup', { result: 'missing_ses_env' });
    return json(503, { message: 'Nyhedsbrevet er ved at blive gjort klar. Prøv igen lidt senere.' });
  }

  let body: { email?: unknown; source?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { message: 'Ugyldig forespørgsel.' });
  }

  const email = String(body?.email || '').trim();
  const source = String(body?.source || 'website').slice(0, 160);
  if (!email || email.length > 320 || !email.includes('@')) {
    return json(400, { message: 'Indtast en gyldig e-mailadresse.' });
  }

  const { data, error } = await supabase.rpc('newsletter_begin_signup', {
    p_email: email,
    p_newsletter: 'daily',
    p_consent_version: CONSENT_VERSION,
    p_consent_text: CONSENT_TEXT,
    p_signup_source: source
  });

  if (error) {
    const code = classifyNewsletterRpcError(error);
    logNewsletter('newsletter_signup', { result: code, source });
    const mapped = newsletterRpcResponse(code);
    return json(mapped.status, mapped.body);
  }

  const token = Array.isArray(data) ? data[0]?.confirmation_token : null;
  if (!token) {
    logNewsletter('newsletter_signup', { result: 'missing_token', source });
    return json(500, { message: 'Tilmeldingen kunne ikke gennemføres. Prøv igen.' });
  }

  const base = site || new URL('https://morgentidende.dk');
  const confirmationUrl = new URL('/nyhedsbrev/bekraeft', base);
  confirmationUrl.searchParams.set('token', token);

  const mail = await sendSesHtmlEmail({
    region: env.awsRegion,
    accessKeyId: env.awsAccessKeyId,
    secretAccessKey: env.awsSecretAccessKey,
    from: env.newsletterFrom,
    to: email,
    subject: 'Bekræft dit nyhedsbrev fra Morgentidende',
    html: buildNewsletterConfirmationEmail(confirmationUrl.toString())
  });

  if (!mail.ok) {
    logNewsletter('newsletter_signup', { result: 'ses_failed', source, provider_status: mail.status });
    return json(502, { message: 'Vi kunne ikke sende bekræftelsesmailen. Prøv igen om lidt.' });
  }

  const marked = await supabase.rpc('newsletter_mark_confirmation_sent', {
    p_email: email,
    p_newsletter: 'daily'
  });
  if (marked.error) {
    logNewsletter('newsletter_signup', { result: 'mark_sent_failed', source });
  }

  logNewsletter('newsletter_signup', { result: 'ok', source });
  return json(200, { ok: true, message: NEUTRAL_SIGNUP_MESSAGE });
};
