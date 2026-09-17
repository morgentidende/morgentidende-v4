import type { APIRoute } from 'astro';
import { getNewsletterRuntimeEnv, hasSesEnv, hasSupabaseServerEnv } from '../../../lib/runtime-env';
import { getV4SupabaseServer } from '../../../lib/v4-supabase-server';

const reply = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

export const GET: APIRoute = async ({ locals }) => {
  const out: Record<string, unknown> = {
    ok: false,
    stage: 'start',
    global_env_present: Boolean((globalThis as typeof globalThis & { __MORGENTIDENDE_ENV?: unknown }).__MORGENTIDENDE_ENV),
    legacy_runtime_present: Boolean((locals as { runtime?: unknown } | undefined)?.runtime)
  };

  try {
    out.stage = 'runtime_env';
    const env = getNewsletterRuntimeEnv(locals);
    out.supabase_env = hasSupabaseServerEnv(env);
    out.ses_env = hasSesEnv(env);

    out.stage = 'supabase_client';
    const supabase = getV4SupabaseServer(locals);
    out.supabase_client = Boolean(supabase);
    if (!supabase) return reply(out);

    out.stage = 'rpc';
    try {
      const result = await supabase.rpc('newsletter_daily_articles', { p_now: new Date().toISOString() });
      out.rpc_ok = !result.error;
      out.rpc_error = result.error?.code || null;
    } catch (error) {
      out.rpc_ok = false;
      out.rpc_exception = error instanceof Error ? error.name : 'Error';
    }

    out.stage = 'done';
    out.ok = Boolean(out.supabase_env && out.ses_env && out.rpc_ok);
    return reply(out);
  } catch (error) {
    out.exception = error instanceof Error ? error.name : 'Error';
    out.message = error instanceof Error ? String(error.message).slice(0, 180) : 'unknown';
    return reply(out);
  }
};
