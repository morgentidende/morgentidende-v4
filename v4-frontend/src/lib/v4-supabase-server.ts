import { createClient } from '@supabase/supabase-js';
import { v4Supabase } from './v4-supabase';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

const privileged = url && serviceRoleKey
  ? createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

// Safe transition: server routes prefer the private service-role client, but keep
// the current publishable client as a temporary fallback until the Cloudflare
// secret is configured. Remove the fallback once anon RPC execution is revoked.
export const v4SupabaseServer = privileged || v4Supabase;
export const v4SupabaseServerIsPrivileged = Boolean(privileged);
