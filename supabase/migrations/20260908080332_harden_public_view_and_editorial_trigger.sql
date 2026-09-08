alter view public.v4_public_articles set (security_invoker = true);

alter function public.set_editorial_updated_at() set search_path = public;
