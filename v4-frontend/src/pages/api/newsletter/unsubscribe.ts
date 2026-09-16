import type { APIRoute } from 'astro';
import { getV4SupabaseServer } from '../../../lib/v4-supabase-server';

const unsubscribe = async (locals: App.Locals, token: string) => {
  const supabase = getV4SupabaseServer(locals);
  if (!supabase || !/^[0-9a-f-]{36}$/i.test(token)) return false;
  const { data, error } = await supabase.rpc('newsletter_unsubscribe', { p_token: token });
  if (error) {
    console.info(JSON.stringify({ event: 'newsletter_unsubscribe', result: 'rpc_error' }));
    return false;
  }
  return data === true;
};

export const POST: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  await unsubscribe(locals, token);
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
};

export const GET: APIRoute = async ({ request, redirect, locals }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  const ok = await unsubscribe(locals, token);
  return redirect(`/nyhedsbrev/afmeldt?status=${ok ? 'ok' : 'ukendt'}`, 303);
};
