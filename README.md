# Morgentidende v4

Morgentidende – få begge sider af sagen i Danmarks nye avis.

## Struktur
- `v4-frontend/` – Astro/Cloudflare frontend for Morgentidende v4.
- `supabase/migrations/` – versioneret v4 database-schema og sikkerhed.
- `docs/v4-spec.md` – produkt-, design- og redaktionsspecifikation.

## Principper
- ChatGPT er den redaktionelle motor.
- Supabase håndterer artikler, scheduling, relationer, læser-login og versionshistorik.
- Cloudflare bruges til v4-frontend/deployment og senere scheduler/medielag.
- Ingen secrets må ligge i dette offentlige repo.
- Offentlige læsere får kun adgang til eksplicitte `v4_public_*` views.

## Status
V4 core schema, RLS/sikkerhed, public views og første frontend-skelet er oprettet.
