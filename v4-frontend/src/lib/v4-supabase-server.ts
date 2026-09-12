import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

export const v4SupabaseServer = url && serviceRoleKey
  ? createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;
