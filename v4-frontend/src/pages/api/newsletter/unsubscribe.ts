import type { APIRoute } from 'astro';
import { v4SupabaseServer } from '../../../lib/v4-supabase-server';

const unsubscribe = async (token: string) => {
  if (!v4SupabaseServer || !/^[0-9a-f-]{36}$/i.test(token)) return false;
  const { data, error } = await v4SupabaseServer.rpc('newsletter_unsubscribe', { p_token: token });
  return !error && data === true;
};

export const POST: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  await unsubscribe(token);

  // RFC 8058 one-click unsubscribe clients expect a successful response and no confirmation flow.
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
};

export const GET: APIRoute = async ({ request, redirect }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  const ok = await unsubscribe(token);
  return redirect(`/nyhedsbrev/afmeldt?status=${ok ? 'ok' : 'ukendt'}`, 303);
};
