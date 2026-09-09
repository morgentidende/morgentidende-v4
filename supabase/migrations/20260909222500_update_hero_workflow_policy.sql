update public.site_settings
set value = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(value, '{magazine_default_ai_hero}', 'true'::jsonb, true),
      '{magazine_default_categories}', '["Viden","Liv"]'::jsonb, true
    ),
    '{single_generation_default}', 'true'::jsonb, true
  ),
  '{manual_prepublication_media_test}', 'false'::jsonb, true
), updated_at = now()
where key = 'hero_editorial_policy';
