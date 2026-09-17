-- Minimal read grants required by the service-role social dispatcher.
-- Keep public roles unchanged; these grants do not expose settings/categories publicly.

grant select (key, value) on public.site_settings to service_role;
grant select (id, name) on public.categories to service_role;
