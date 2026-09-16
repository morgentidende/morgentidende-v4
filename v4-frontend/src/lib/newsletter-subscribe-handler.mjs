import { NEUTRAL_SIGNUP_MESSAGE, classifyNewsletterRpcError, newsletterRpcResponse } from './newsletter-errors.mjs';

export const CONSENT_VERSION = 'daily-v2-2026-09-12';
export const CONSENT_TEXT = 'Jeg vil modtage Morgentidendes daglige nyhedsbrev. Nyhedsbrevet kan indeholde annoncer og kommercielle links, herunder affiliate-links til produkter og tjenester fra tredjeparter. Jeg kan til enhver tid afmelde mig.';

export const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

export const logNewsletter = (event, fields) => {
  const safe = { event };
  for (const [key, value] of Object.entries(fields || {})) {
    if (key === 'email' || key === 'token' || key === 'confirmation_token') continue;
    safe[key] = value;
  }
  console.info(JSON.stringify(safe));
};

export const parseSubscribeJson = async (request) => {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
};

export const validateSubscribeEmail = (value) => {
  const email = String(value || '').trim();
  if (!email || email.length > 320 || !email.includes('@')) return null;
  const at = email.indexOf('@');
  const domain = email.slice(at + 1);
  if (at < 1 || !domain.includes('.') || domain.endsWith('.') || domain.startsWith('.')) return null;
  return email;
};

export const handleSubscribeRequest = async (request, deps) => {
  try {
    const parsed = await parseSubscribeJson(request);
    if (!parsed.ok) return json(400, { message: 'Ugyldig forespørgsel.' });

    const email = validateSubscribeEmail(parsed.body?.email);
    const source = String(parsed.body?.source || 'website').slice(0, 160);
    if (!email) return json(400, { message: 'Indtast en gyldig e-mailadresse.' });

    const env = deps.getEnv();
    const supabase = deps.getSupabase();
    if (!supabase) {
      logNewsletter('newsletter_signup', { result: 'missing_supabase_env' });
      return json(503, { message: 'Nyhedsbrevet er midlertidigt utilgængeligt.' });
    }
    if (!deps.hasSesEnv(env)) {
      logNewsletter('newsletter_signup', { result: 'missing_ses_env' });
      return json(503, { message: 'Nyhedsbrevet er ved at blive gjort klar. Prøv igen lidt senere.' });
    }

    return await deps.runBackend({ env, supabase, email, source });
  } catch (error) {
    logNewsletter('newsletter_signup', {
      result: 'unhandled_exception',
      type: error?.name || 'Error',
      stack: String(error?.stack || error?.message || 'unknown').slice(0, 800)
    });
    return json(500, { message: 'Tilmeldingen kunne ikke gennemføres. Prøv igen.' });
  }
};

export const runNewsletterBackend = async ({ env, supabase, email, source, site, sendMail, buildHtml }) => {
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

  const row = Array.isArray(data) ? data[0] : null;
  const token = row?.confirmation_token;
  const reservationId = row?.reservation_id;
  if (!token || !reservationId) {
    logNewsletter('newsletter_signup', { result: 'missing_token', source });
    return json(500, { message: 'Tilmeldingen kunne ikke gennemføres. Prøv igen.' });
  }

  const base = site || new URL('https://morgentidende.dk');
  const confirmationUrl = new URL('/nyhedsbrev/bekraeft', base);
  confirmationUrl.searchParams.set('token', token);

  const mail = await sendMail({
    region: env.awsRegion,
    accessKeyId: env.awsAccessKeyId,
    secretAccessKey: env.awsSecretAccessKey,
    from: env.newsletterFrom,
    to: email,
    subject: 'Bekræft dit nyhedsbrev fra Morgentidende',
    html: buildHtml(confirmationUrl.toString())
  });

  if (!mail.ok) {
    const released = await supabase.rpc('newsletter_release_confirmation_reservation', {
      p_email: email,
      p_newsletter: 'daily',
      p_reservation_id: reservationId
    });
    logNewsletter('newsletter_signup', {
      result: released.error || released.data === false ? 'stale_release' : 'ses_failed',
      source,
      provider_status: mail.status
    });
    return json(502, { message: 'Vi kunne ikke sende bekræftelsesmailen. Prøv igen om lidt.' });
  }

  const marked = await supabase.rpc('newsletter_mark_confirmation_sent', {
    p_email: email,
    p_newsletter: 'daily',
    p_reservation_id: reservationId
  });
  if (marked.error || marked.data === false) {
    logNewsletter('newsletter_signup', { result: 'stale_completion', source });
  } else {
    logNewsletter('newsletter_signup', { result: 'ok', source });
  }

  return json(200, { ok: true, message: NEUTRAL_SIGNUP_MESSAGE });
};
