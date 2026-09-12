-- docs/magazine-editorial-policy.md is the authoritative owner of Viden/Liv editorial policy.
-- The legacy site_settings mirror is not read by the active frontend, Edge Function,
-- database functions, workers, or current magazine automation.
delete from public.site_settings
where key = 'magazine_editorial_policy';
