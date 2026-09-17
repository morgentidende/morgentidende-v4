import type { APIRoute } from 'astro';
import { getNewsletterRuntimeEnv, hasSesEnv, hasSupabaseServerEnv } from '../../../lib/runtime-env';
import { getV4SupabaseServer } from '../../../lib/v4-supabase-server';

export const GET: APIRoute = async ({ locals }) => {
  const env = getNewsletterRuntimeEnv(locals);
  const supabase = getV4SupabaseServer(locals);
  let rpcOk = false;
  let rpcError = '';

  if (supabase) {
    const result = await supabase.rpc('newsletter_daily_articles', { p_now: new Date().toISOString() });
    rpcOk = !result.error;
    rpcError = result.error?.code || '';
  }

  return new Response(JSON.stringify({
    ok: hasSupabaseServerEnv(env) && hasSesEnv(env) && rpcOk,
    supabase_env: hasSupabaseServerEnv(env),
    ses_env: hasSesEnv(env),
    rpc_ok: rpcOk,
    rpc_error: rpcError || null
  }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
};
