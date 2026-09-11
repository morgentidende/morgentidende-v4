import type { APIRoute } from 'astro';
import { v4Supabase } from '../../../lib/v4-supabase';
import { buildNewsletterConfirmationEmail } from '../../../lib/newsletter-email';

const CONSENT_VERSION = 'daily-v1-2026-09-11';
const CONSENT_TEXT = 'Jeg vil modtage Morgentidendes daglige nyhedsbrev kl. 06. Nyhedsbrevet kan indeholde annoncer og kommercielle links, herunder affiliate-links til produkter og tjenester fra tredjeparter. Jeg kan til enhver tid afmelde mig.';
const NEWSLETTER_FROM = 'Morgentidende <nyhedsbrev@morgentidende.dk>';

export const POST: APIRoute = async ({ request, site }) => {
  if (!v4Supabase) {
    return new Response(JSON.stringify({ message: 'Nyhedsbrevet er midlertidigt utilgængeligt.' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }

  const resendApiKey = import.meta.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return new Response(JSON.stringify({ message: 'Nyhedsbrevet er ved at blive gjort klar. Prøv igen lidt senere.' }), { status: 503, headers: { 'content-type': 'application/json' } });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ message: 'Ugyldig forespørgsel.' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const email = String(body?.email || '').trim();
  const source = String(body?.source || 'website').slice(0, 160);
  if (!email || email.length > 320) {
    return new Response(JSON.stringify({ message: 'Indtast en gyldig e-mailadresse.' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const { data, error } = await v4Supabase.rpc('newsletter_begin_signup', {
    p_email: email,
    p_newsletter: 'daily',
    p_consent_version: CONSENT_VERSION,
    p_consent_text: CONSENT_TEXT,
    p_signup_source: source
  });

  if (error || !Array.isArray(data) || !data[0]?.confirmation_token) {
    return new Response(JSON.stringify({ message: 'Tilmeldingen kunne ikke gennemføres. Prøv igen.' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const base = site || new URL('https://morgentidende.dk');
  const confirmationUrl = new URL('/nyhedsbrev/bekraeft', base);
  confirmationUrl.searchParams.set('token', data[0].confirmation_token);

  const mailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${resendApiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from: NEWSLETTER_FROM,
      to: [email],
      subject: 'Bekræft dit nyhedsbrev fra Morgentidende',
      html: buildNewsletterConfirmationEmail(confirmationUrl.toString())
    })
  });

  if (!mailResponse.ok) {
    console.error('Newsletter confirmation email failed', mailResponse.status, await mailResponse.text());
    return new Response(JSON.stringify({ message: 'Vi kunne ikke sende bekræftelsesmailen. Prøv igen om lidt.' }), { status: 502, headers: { 'content-type': 'application/json' } });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    }
  });
};
