-- Reader accounts are no longer part of Morgentidende.
-- Keep Supabase Postgres, RLS, REST and service-role workflows for editorial/media data.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_reader();
drop table if exists public.reader_profiles;
