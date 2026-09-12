-- Newsletter mutations now run only from the server-side service-role client.
-- Remove direct browser/anon execution so confirmation tokens cannot be minted or used through PostgREST.
revoke execute on function public.newsletter_begin_signup(text,text,text,text,text) from anon;
revoke execute on function public.newsletter_confirm_signup(text) from anon;
revoke execute on function public.newsletter_unsubscribe(uuid) from anon;

grant execute on function public.newsletter_begin_signup(text,text,text,text,text) to service_role;
grant execute on function public.newsletter_confirm_signup(text) to service_role;
grant execute on function public.newsletter_unsubscribe(uuid) to service_role;
