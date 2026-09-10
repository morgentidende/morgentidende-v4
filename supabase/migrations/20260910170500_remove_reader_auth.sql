-- Reader accounts are no longer part of Morgentidende.
-- Keep Supabase Postgres, RLS, REST and service-role workflows for editorial/media data.

-- Remove the auth.users -> reader_profiles trigger first.
drop trigger if exists on_auth_user_created on auth.users;

-- Remove the helper that auto-created reader profiles.
drop function if exists public.handle_new_reader();

-- Remove reader profile data and its RLS policies with the table.
drop table if exists public.reader_profiles;
