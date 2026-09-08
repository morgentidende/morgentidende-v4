# Morgentidende v4

Morgentidende – få begge sider af sagen i Danmarks nye avis.

## Autoritativ struktur
- `v4-frontend/` – aktiv Astro/Cloudflare-frontend.
- `supabase/migrations/` – database- og sikkerhedshistorik. Migrationsfiler bevares som versionshistorik og må ikke behandles som parallel aktiv applikationslogik.
- `docs/v4-spec.md` – gældende produkt-, design-, udviklings- og redaktionsregler.
- `docs/magazine-editorial-policy.md` – supplerende gældende regler for Viden og Liv.

## Arkitektur
- ChatGPT er den redaktionelle motor.
- Supabase håndterer artikler, scheduling, relationer, læser-login og versionshistorik.
- Cloudflare driver frontend/deployment.
- Ingen secrets må ligge i det offentlige repo.
- Offentlige læsere får kun adgang til eksplicitte `v4_public_*` views.

## Vedligeholdelsesregel
Der skal kun være én aktiv implementation af en funktion eller designmekanisme. Når kode eller regler erstattes, fjernes den gamle aktive version i samme ændring. Historik bevares i Git/audit-log i stedet for som dead code eller konkurrerende regler.