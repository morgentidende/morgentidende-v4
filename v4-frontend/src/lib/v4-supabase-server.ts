import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getNewsletterRuntimeEnv, hasSupabaseServerEnv, type NewsletterRuntimeEnv } from './runtime-env';

const createServerClient = (env: NewsletterRuntimeEnv): SupabaseClient | null => {
  if (!hasSupabaseServerEnv(env)) return null;
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
};

export const getV4SupabaseServer = (locals?: App.Locals) =>
  createServerClient(getNewsletterRuntimeEnv(locals));

// Local/dev fallback when Worker runtime env is not injected.
export const v4SupabaseServer = createServerClient(getNewsletterRuntimeEnv());
