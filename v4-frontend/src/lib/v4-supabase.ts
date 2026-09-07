import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const key = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const v4Supabase = url && key
  ? createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : null;
