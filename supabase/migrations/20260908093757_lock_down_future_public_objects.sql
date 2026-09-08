-- Deny-by-default for future objects created by the postgres role in public.
-- Client access must be granted explicitly in the same migration that creates an object.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
