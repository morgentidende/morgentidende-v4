import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getNewsletterRuntimeEnv, hasSupabaseServerEnv, type NewsletterRuntimeEnv } from './runtime-env';

const createServerClient = (env: NewsletterRuntimeEnv): SupabaseClient | null => {
  if (!hasSupabaseServerEnv(env)) return null;
  try {
    return createClient(env.supabaseUrl, env.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  } catch (error) {
    console.info(JSON.stringify({
      event: 'supabase_client_init_failed',
      type: (error as Error)?.name || 'Error',
      stack: String((error as Error)?.stack || (error as Error)?.message || 'unknown').slice(0, 800)
    }));
    return null;
  }
};

export const getV4SupabaseServer = (locals?: App.Locals) =>
  createServerClient(getNewsletterRuntimeEnv(locals));
