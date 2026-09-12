import type { APIRoute } from 'astro';
import { v4SupabaseServer, v4SupabaseServerIsPrivileged } from '../../../lib/v4-supabase-server';

export const GET: APIRoute = async () => {
  if (!v4SupabaseServerIsPrivileged || !v4SupabaseServer) {
    return new Response(JSON.stringify({ ok: false, privileged: false }), {
      status: 503,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  }

  const { error } = await v4SupabaseServer.rpc('newsletter_confirm_signup', { p_token: 'invalid-health-check-token' });
  return new Response(JSON.stringify({ ok: !error, privileged: true }), {
    status: error ? 503 : 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
};
