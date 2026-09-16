-- Newsletter signup/confirmation use pgcrypto helpers installed in the
-- extensions schema. Include that schema explicitly so SECURITY DEFINER
-- functions resolve gen_random_bytes()/digest() reliably in production.

alter function public.newsletter_begin_signup(text,text,text,text,text)
  set search_path = public, extensions;

alter function public.newsletter_confirm_signup(text)
  set search_path = public, extensions;
