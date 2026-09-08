-- Prevent untrusted client roles from creating objects in the public schema.
-- Existing explicitly granted SELECT access to v4_public_* views is unchanged.
revoke create on schema public from public;
revoke create on schema public from anon, authenticated;

grant usage on schema public to anon, authenticated;
