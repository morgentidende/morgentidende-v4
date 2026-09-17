import type { APIRoute } from 'astro';
import { getNewsletterRuntimeEnv, hasSesEnv } from '../../../lib/runtime-env';
import { sendSesHtmlEmail } from '../../../lib/ses-email';

const safeBody = (value: string) => {
  try {
    const parsed = JSON.parse(value || '{}');
    return {
      type: String(parsed?.type || parsed?.__type || parsed?.code || '').slice(0, 120) || null,
      message: String(parsed?.message || parsed?.Message || '').slice(0, 240) || null
    };
  } catch {
    return { type: null, message: String(value || '').replace(/\s+/g, ' ').slice(0, 240) || null };
  }
};

export const GET: APIRoute = async () => {
  try {
    const env = getNewsletterRuntimeEnv();
    if (!hasSesEnv(env)) {
      return new Response(JSON.stringify({ ok: false, stage: 'env', ses_env: false }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
      });
    }

    const result = await sendSesHtmlEmail({
      region: env.awsRegion,
      accessKeyId: env.awsAccessKeyId,
      secretAccessKey: env.awsSecretAccessKey,
      from: env.newsletterFrom,
      to: 'success@simulator.amazonses.com',
      subject: 'Morgentidende SES probe',
      html: '<p>SES diagnostic probe.</p>'
    });

    return new Response(JSON.stringify({
      ok: result.ok,
      stage: 'send',
      status: result.status,
      error: result.ok ? null : safeBody(result.body)
    }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      stage: 'exception',
      exception: error instanceof Error ? error.name : 'Error',
      message: String(error instanceof Error ? error.message : error).slice(0, 240)
    }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  }
};
