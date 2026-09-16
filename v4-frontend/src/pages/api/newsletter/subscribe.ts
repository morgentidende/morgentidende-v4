import type { APIRoute } from 'astro';
import { getV4SupabaseServer } from '../../../lib/v4-supabase-server';
import { buildNewsletterConfirmationEmail } from '../../../lib/newsletter-email';
import { getNewsletterRuntimeEnv, hasSesEnv } from '../../../lib/runtime-env';
import { sendSesHtmlEmail } from '../../../lib/ses-email';
import { handleSubscribeRequest, runNewsletterBackend } from '../../../lib/newsletter-subscribe-handler.mjs';

export const POST: APIRoute = async ({ request, site, locals }) =>
  handleSubscribeRequest(request, {
    getEnv: () => getNewsletterRuntimeEnv(locals),
    getSupabase: () => getV4SupabaseServer(locals),
    hasSesEnv,
    runBackend: ({ env, supabase, email, source }) =>
      runNewsletterBackend({
        env,
        supabase,
        email,
        source,
        site,
        sendMail: sendSesHtmlEmail,
        buildHtml: buildNewsletterConfirmationEmail
      })
  });
